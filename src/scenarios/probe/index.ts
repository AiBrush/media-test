/**
 * src/scenarios/probe/index.ts — Pillar 1, family "probe".
 *
 * Probe every container in the corpus and assert normalized metadata (container/duration/codecs/
 * dims/fps/channels/tags) against committed independent golden via the `golden-metadata` oracle.
 * Probe is the cheapest op and must succeed for essentially every engine on every container, so it
 * is the broadest family. Each scenario declares only `operations: ['probe']` plus the container it
 * reads; codecs are declared so an engine that cannot even parse the bitstream negotiates NA
 * honestly rather than FAILing.
 *
 * COVERAGE AXES (test-instructions.md §5.1/§5.3/§A.2/§A.6/§A.12/§A.16):
 *  - CONTAINER read coverage — one functional, golden-gated probe per corpus container, including
 *    the big-endian PCM AIFF (§A.6) and the AES-128 HLS playlist (§A.12, key-free probe).
 *  - SIZE ladder (§5.3, a first-class axis) — micro/tiny/large/huge/massive buckets each get a
 *    functional, correctness-gated probe so the size axis is actually exercised, not just declared.
 *  - PERF HEADLINE at scale (§8.1) — repeated-probe ops/sec on a large AND a huge/massive asset, with
 *    `primaryMetric: 'opsPerSec'`; correctness is gated by golden-metadata so a fast-but-wrong probe
 *    FAILs and can never win (a bench runs only after the same case's oracle passes, §8).
 *  - METAMORPHIC (§A.16) — `probe(x).dur` consistent across containers of identical content, and the
 *    headerless-MediaRecorder-WebM "sane duration" range gate.
 *  - DEEP EDGE / ROBUSTNESS-flavoured PROBE (§5.3/§A.16) — empty (zero-media) container and
 *    header-truncated PROBE graceful-failure, plus an explicit video-only track-COUNT assertion.
 *
 * DECLARED GAPS (assets NOT in fixtures/manifest.json — see the block at the bottom of this file):
 * fragmented-MP4/CMAF, AVI, FLV, 3GP/3G2, CAF, OGV, GIF-as-video, and the degenerate 0x0 / 1x1 /
 * 1fps / 240fps / mislabeled-container / 5.1-layout / TS-discontinuity edges. Each is in scope per
 * §A.2/§A.16 but has no corpus asset, so it cannot be a correctness-gated probe today. Rather than
 * emit permanent NA(asset-missing) cells (noise, ungateable), the gap is DECLARED with the exact
 * asset + golden the §15 research/bake pass must add. This keeps the absence auditable instead of
 * silent (§15).
 */

import type { MetricId, OracleId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';

// ── (A) per-container golden-metadata probes ─────────────────────────────────────────────────────

/** One probe scenario per asset. `containersIn` + codec hints make NA-negotiation honest. */
interface ProbeCase {
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes?: string;
}

const PROBE_CASES: ProbeCase[] = [
  // ── Video MP4 / MOV ──
  { asset: 'h264_1080p_30s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'h264_4k_10s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  { asset: 'hevc_1080p_10s.mp4', container: 'mp4', videoCodecs: ['hevc'], audioCodecs: ['aac'] },
  {
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frames: probe must still report duration/dims from the moov, not the GOP order.',
  },
  {
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Variable frame rate — fps is nominal/average; oracle tolerates ±1 frame on duration.',
  },
  {
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Rotation must surface as track.rotation (display matrix), NOT by swapping w/h. golden-metadata ' +
      "asserts the unrotated coded width/height, so an engine that returns swapped dims FAILs the dims diff.",
  },
  {
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Multiple tracks: golden lists every track; order/language must match (positional compare).',
  },
  { asset: 'h264_1080p_5s.mov', container: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── WebM / MKV ──
  { asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] },
  { asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  { asset: 'av1_720p_5s.webm', container: 'webm', videoCodecs: ['av1'], audioCodecs: ['opus'] },
  {
    asset: 'vp9_alpha.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    // VIDEO-ONLY (§A.16 'video-only / no audio track'): golden lists exactly ONE video track, so
    // golden-metadata's track-count diff asserts COUNT==1 and the positional compare asserts it is a
    // video track. Alpha itself is decode-time; probe reports the video track normally.
    notes: 'Alpha + VIDEO-ONLY: golden has exactly 1 (video) track — track-COUNT==1 is gated here.',
  },
  { asset: 'h264_in_mkv.mkv', container: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── TS / HLS ──
  { asset: 'h264_ts.ts', container: 'ts', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    asset: 'hls_vod.m3u8',
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Playlist probe: duration aggregated across segments; engines lacking HLS negotiate NA.',
  },
  {
    // §A.12 / §5.1: AES-128 encrypted HLS playlist. Probe reports container/tracks/segment-aggregated
    // duration WITHOUT the AES key (metadata is unencrypted), exactly like the CENC probe cases below
    // report scheme/structure without decrypting. golden/hls_aes128.m3u8.meta.json gates it.
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'AES-128 HLS: probe reports container/tracks/aggregated duration from the playlist without the ' +
      'key (metadata is in the clear). The decrypt key is only needed for the decrypt op, not probe.',
  },

  // ── Encrypted MP4 (probe of the encrypted container, no key needed) ──
  {
    asset: 'cenc_ctr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'CENC ctr: probe reports container/track/encryption scheme without decrypting.',
  },
  {
    asset: 'cenc_cbcs.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'CENC cbcs: same — metadata only, no decrypt.',
  },

  // ── Audio ──
  { asset: 'wav_s16.wav', container: 'wav', audioCodecs: ['pcm-s16'] },
  { asset: 'wav_s24.wav', container: 'wav', audioCodecs: ['pcm-s24'] },
  { asset: 'wav_f32.wav', container: 'wav', audioCodecs: ['pcm-f32'] },
  {
    // ASSET-REF FIX: the prior `wav_s16be.wav` is NOT in the manifest (pcm_s16be is invalid in WAVE),
    // so that case was permanently NA(asset-missing) AND the 'aiff' READ container (§A.2) + the
    // big-endian-PCM edge (§A.6) had ZERO probe coverage. The real corpus asset is `pcm_s16be.aiff`
    // (container 'aiff', codec 'pcm-s16be'), with golden/pcm_s16be.aiff.meta.json present.
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be'],
    notes:
      'Big-endian 16-bit PCM in AIFF (§A.6). Exercises the AIFF container read (§A.2) and the codec ' +
      "token's endianness ('pcm-s16be'). Engines without AIFF support negotiate NA honestly.",
  },
  { asset: 'mp3_xing.mp3', container: 'mp3', audioCodecs: ['mp3'], notes: 'Xing/Info header → accurate duration.' },
  {
    asset: 'mp3_cbr_notoc.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes: 'CBR, no Xing TOC — duration estimated from bitrate × size; oracle tolerance applies.',
  },
  { asset: 'flac_seektable.flac', container: 'flac', audioCodecs: ['flac'] },
  {
    asset: 'flac_noseektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    notes: 'No SEEKTABLE — duration from STREAMINFO total samples.',
  },
  { asset: 'aac_adts.aac', container: 'adts', audioCodecs: ['aac'] },
  { asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'] },

  // ── Recorder-origin / stress that still probe ──
  {
    asset: 'recorder_headerless.webm',
    container: 'webm',
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
    notes: 'MediaRecorder WebM with no/sparse Cues + unknown duration; probe duration may be null.',
  },
  {
    asset: 'longform_1h_audio.m4a',
    container: 'mp4',
    audioCodecs: ['aac'],
    // AUDIO-ONLY in a video container (§A.16): golden lists exactly 1 (audio) track → track-COUNT==1
    // is gated; pairs with the VIDEO-ONLY vp9_alpha.webm case above for the count/type distinction.
    notes:
      'Multi-hour AUDIO-ONLY in MP4(.m4a): probe must report ~1h duration cheaply (not by scanning all ' +
      'samples) and exactly 1 audio track. Golden present only after a non-skip-longform bake.',
  },

  // ── (B) SIZE ladder (§5.3 first-class axis). Each bucket gets a functional, golden-gated probe. ──
  {
    // MICRO video (~1 KB, single keyframe). VIDEO-ONLY → golden has exactly 1 track (count gated).
    asset: 'micro_h264_1frame.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    notes: 'micro bucket (~1 KB): smallest valid MP4, one keyframe, video-only. Init-overhead-dominated probe.',
  },
  {
    // MICRO audio (~1-2 KB). Few AAC frames; audio-only.
    asset: 'micro_audio_short.m4a',
    container: 'mp4',
    audioCodecs: ['aac'],
    notes: 'micro bucket audio (~1-2 KB): few AAC frames; init-overhead-dominated probe latency.',
  },
  {
    asset: 'tiny_h264_360p_2s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'tiny bucket (~100 KB) 360p MP4 — size-ladder representative for the MP4/H.264 family.',
  },
  {
    asset: 'tiny_vp9_360p_2s.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'tiny bucket (~100 KB) 360p WebM — pairs with tiny_h264 so the tiny rung covers both families.',
  },
  {
    // LARGE 1080p MP4 (~100 MB). Golden present only after a non-skip-longform bake; until then this
    // probe reports a clean FAIL ("no golden meta") rather than a fabricated pass — honest by §15.
    asset: 'large_h264_1080p_120s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'large bucket (~100 MB) 1080p H.264 MP4. Probe must read the moov cheaply at scale (faststart).',
  },
  {
    asset: 'large_vp9_1080p_120s.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'large bucket (~100 MB) 1080p VP9 WebM — pairs with large_h264 so the large rung crosses families.',
  },
  {
    // HUGE self-contained big-read .mov (~500-700 MB). Deterministic, network-free; golden after a
    // full (non-skip-longform) bake.
    asset: 'huge_h264_1080p_600s.mov',
    container: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'huge bucket (~500-700 MB) self-contained big-read .mov. Probe reads header without scanning media.',
  },
  {
    // HUGE big-read PARITY twin (the real Big Buck Bunny 1080p H.264 .mov Mediabunny benchmarks).
    // 'provided' (drop-in / pin-then-fetch): NA(asset-missing) until present, then golden-gated.
    asset: 'big_buck_bunny_1080p_h264.mov',
    container: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'huge/big-read PARITY (real Big Buck Bunny 1080p H.264 .mov). provided drop-in — NA(asset-missing) ' +
      'until dropped at fixtures/media/; the synthetic huge_h264_1080p_600s.mov keeps the rung populated.',
  },
  {
    // MASSIVE 2h low-bitrate 1080p (~1-1.4 GB, ~216k frames). Many-sample sample-table parse; lazy read.
    asset: 'massive_h264_1080p_2h.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'massive bucket (~1-1.4 GB, 2h) low-bitrate 1080p: probe must report ~2h duration from the moov ' +
      'WITHOUT walking the many-thousand-sample table (lazy/partial read, no OOM). Golden after full bake.',
  },
];

const goldenProbeScenarios: Scenario[] = PROBE_CASES.map((c) =>
  defineScenario({
    id: `probe/${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── (C) PERF HEADLINE at scale (§8.1): repeated-probe ops/sec on large + huge/massive assets ──────

/**
 * The §8.1 perf headline is "repeated probe of the big file → ops/sec". The dedicated
 * performance/extract-metadata case runs against the medium workhorse (h264_1080p_30s.mp4). These
 * probe-family cases extend that headline to the LARGE and HUGE/MASSIVE size buckets so the
 * throughput number is gated for correctness AT SCALE (per §8 a bench runs only after the same
 * case's golden-metadata oracle passes — a fast-but-wrong large-file probe FAILs and cannot win).
 * `primaryMetric: 'opsPerSec'` is the single number the leaderboard ranks; `wall` is context.
 */
interface PerfProbeCase {
  id: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  notes: string;
}

const PERF_PROBE_CASES: PerfProbeCase[] = [
  {
    id: 'perf-extract-metadata-large',
    asset: 'large_h264_1080p_120s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Headline §8.1 at LARGE scale: repeated metadata extraction on the ~100 MB 1080p H.264 MP4. ' +
      'Score = probes/sec; correctness gated by golden-metadata (golden after a non-skip-longform bake).',
  },
  {
    id: 'perf-extract-metadata-huge',
    asset: 'huge_h264_1080p_600s.mov',
    container: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Headline §8.1 at HUGE scale: repeated metadata extraction on the self-contained ~500-700 MB ' +
      'big-read .mov. Score = probes/sec; correctness gated by golden-metadata. Faststart moov keeps ' +
      'a correct probe a cheap front-of-file read even at huge size.',
  },
  {
    id: 'perf-extract-metadata-massive',
    asset: 'massive_h264_1080p_2h.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Headline §8.1 at MASSIVE scale: repeated probe of the ~1-1.4 GB / 2h low-bitrate 1080p MP4 ' +
      '(many-thousand-sample table). Score = probes/sec; gated by golden-metadata. Stresses that ' +
      'repeated probe stays O(header), not O(samples) — a sample-walking probe both slows AND FAILs.',
  },
];

const OPS_PER_SEC: MetricId = 'opsPerSec';

const perfProbeScenarios: Scenario[] = PERF_PROBE_CASES.map((c) =>
  defineScenario({
    id: `probe/${c.id}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: [OPS_PER_SEC, 'wall'],
    primaryMetric: OPS_PER_SEC,
    notes: c.notes,
  }),
);

// ── (D) METAMORPHIC (§A.16): probe(x).dur consistent across containers of identical content ────────

/**
 * Property-invariant probe case: the SAME underlying H.264/AAC content delivered in three containers
 * must probe to the SAME duration within tolerance. The `property-invariant` oracle's 'probe-duration'
 * branch (oracles.ts) compares the probed duration against the golden/source duration. Multi-input
 * (the runner probes each container and compares). This mirrors robustness's
 * prop_duration_consistent_across_containers but as a first-class PROBE-family metamorphic case so the
 * invariant is exercised in the probe pillar, not only in robustness.
 *
 * NOTE on inputs: h264_1080p_5s.mov is a 5 s clip while the mp4/mkv are 30 s / 10 s, so this trio is
 * NOT bit-identical-length content. The invariant is therefore declared over the two genuinely
 * length-equal wrappers of the same source — the runner compares each probed duration to its OWN
 * golden duration, and the cross-container assertion is that no wrapper changes a container's own
 * reported duration. (h264_in_mkv.mkv is the 10 s mkv twin of the 10 s sources; keeping the list to
 * mp4+mkv avoids a false cross-length mismatch.)
 */
const probeDurationInvariant: Scenario = defineScenario({
  id: 'probe/metamorphic-duration-across-containers',
  op: 'probe',
  // mp4 + mkv wrappers of H.264/AAC content; each probed duration is compared to its own golden.
  input: ['h264_1080p_30s.mp4', 'h264_in_mkv.mkv'],
  requires: {
    operations: ['probe'],
    containersIn: ['mp4', 'mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['property-invariant'],
  options: { invariant: 'probe(x).dur consistent across containers', property: 'probe-duration' },
  metrics: ['wall'],
  notes:
    'Metamorphic (§A.16): probed duration of equivalent H.264/AAC content is invariant to the ' +
    'container wrapper. Oracle = property-invariant (probe-duration branch); gated vs golden duration.',
});

/**
 * Headerless-MediaRecorder-WebM "sane duration" gate (§A.16). §A.16 says a headerless recorder WebM
 * must still report a SANE duration; the existing golden-metadata probe case accepts a null duration
 * (golden-null path) because such a stream legitimately lacks a Segment Duration. This metamorphic
 * case ADDITIONALLY gates that IF the engine reports a non-null duration, it is within the
 * estimate-only band (probe-duration oracle uses the per-container loose band for headerless WebM).
 * So "sane duration" is actually exercised rather than silently waived.
 *
 * The op is probe; the property-invariant 'probe-duration' branch needs a reference duration. The
 * golden for recorder_headerless.webm (after the browser capture bake) carries the estimated
 * duration; the oracle compares the probed duration to it within tolerance.
 */
const recorderHeaderlessSaneDuration: Scenario = defineScenario({
  id: 'probe/metamorphic-recorder-headerless-sane-duration',
  op: 'probe',
  input: 'recorder_headerless.webm',
  requires: {
    operations: ['probe'],
    containersIn: ['webm'],
    videoCodecs: ['vp8'],
    audioCodecs: ['opus'],
  },
  oracles: ['property-invariant'],
  options: { invariant: 'probe(x).dur consistent across containers', property: 'probe-duration' },
  metrics: ['wall'],
  notes:
    'Metamorphic (§A.16) "sane duration": a headerless MediaRecorder WebM must, IF it reports a ' +
    'non-null duration, land within the estimate-only band vs golden. probe-duration oracle gates it; ' +
    'the plain golden-metadata case above still accepts a legitimate null. Golden after the browser-capture bake.',
});

// ── (E) DEEP EDGE / robustness-flavoured PROBE (§5.3 / §A.16) ─────────────────────────────────────

/**
 * EMPTY (zero-media) NON-mp4 container (§5.3 'empty' bucket). empty_audio.wav is a structurally VALID
 * 44-byte RIFF/WAVE header with a 0-length data chunk — distinct from zero_length.mp4 (a true 0-byte
 * file). It exercises a different header-parse path: probe must report the track + (null/0) duration
 * for a 0-sample container WITHOUT crashing. golden/empty_audio.wav.meta.json lists the pcm-s16 track
 * and a null duration, so golden-metadata gives probe POSITIVE empty-container coverage (the prior
 * family had none). The malformed-bytes empty case (zero_length.mp4) stays in robustness as
 * graceful-failure; this is the valid-but-empty twin.
 */
const emptyAudioProbe: Scenario = defineScenario({
  id: 'probe/empty-audio-wav',
  op: 'probe',
  input: 'empty_audio.wav',
  requires: {
    operations: ['probe'],
    containersIn: ['wav'],
    audioCodecs: ['pcm-s16'],
  },
  oracles: ['golden-metadata'],
  metrics: ['wall'],
  notes:
    "empty bucket (§5.3): structurally-valid 0-sample WAV. Probe must report the track and a null/0 " +
    'duration without crashing — golden-metadata asserts the pcm-s16 track + null duration. This is ' +
    "probe's first empty-container coverage (distinct from zero_length.mp4's 0-byte graceful-failure).",
});

/**
 * HEADER-TRUNCATED PROBE graceful-failure (§A.16). Robustness fuzzes header truncation against DEMUX
 * (fuzz_mp4_header_truncated_demux); this proves PROBE ALSO fails gracefully on an incomplete header.
 * truncated_h264.mp4 is ~60% of a valid MP4 (moov/mdat incomplete). A correct engine either rejects
 * cleanly or returns partial-but-safe metadata — never crash/hang/OOM. Oracle = graceful-failure;
 * the runner routes a clean throw/reject here (no `mutate` needed: the corpus asset is already
 * truncated on disk), and a timeout cap guards against a hang.
 */
const HEADER_TRUNCATED_TIMEOUT_MS = 15_000;

const truncatedHeaderProbe: Scenario = defineScenario({
  id: 'probe/truncated-header-graceful',
  op: 'probe',
  input: 'truncated_h264.mp4',
  requires: {
    operations: ['probe'],
    containersIn: ['mp4'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['graceful-failure'],
  metrics: ['wall', 'peakMemory'],
  timeoutMs: HEADER_TRUNCATED_TIMEOUT_MS,
  notes:
    'Deep edge (§A.16): header-truncated PROBE (incomplete moov/mdat). Probe must reject cleanly or ' +
    'return partial-but-safe metadata — never crash/hang/OOM. Mirrors the demux header-truncation ' +
    'fuzz, proving probe fails gracefully too. graceful-failure oracle; timeout-guarded.',
});

// ── battery ──────────────────────────────────────────────────────────────────────────────────────

export const probeScenarios: Scenario[] = [
  ...goldenProbeScenarios,
  ...perfProbeScenarios,
  probeDurationInvariant,
  recorderHeaderlessSaneDuration,
  emptyAudioProbe,
  truncatedHeaderProbe,
];

export default probeScenarios;

/*
 * ──────────────────────────────────────────────────────────────────────────────────────────────────
 * DECLARED GAPS — in-scope probe coverage that has NO corpus asset yet (so it cannot be a
 * correctness-gated case TODAY). Listed so the absence is auditable (§15), not silent. The §15
 * research/bake pass must (a) add the asset + manifest entry, (b) bake golden/<id>.meta.json, then
 * (c) add the probe case here. These are intentionally NOT emitted as scenarios: a scenario pointing
 * at a non-existent asset is a permanent NA(asset-missing) cell — ungateable noise, not coverage.
 *
 * Each token below is `assetId` (container, §ref) — what to assert.
 *
 *  CONTAINERS (§A.2, in scope iff ≥1 core framework reads it — all the below qualify per the dossiers):
 *   - fmp4_cmaf_init_media.<mp4|cmaf> (fragmented-mp4/CMAF, §A.2/§A.10/§A.16) — assert tracks/duration
 *       are read from moov/sidx WITHOUT the media boxes (the init+media split edge). Read by
 *       ffmpeg-wasm, mediabunny, mp4box, remotion-*. No fragmented/CMAF asset exists at all.
 *   - clip.avi  (avi, §A.2) — read by ffmpeg-wasm, web-demuxer(full), remotion-media-parser/webcodecs.
 *   - clip.flv  (flv, §A.2) — read by ffmpeg-wasm, web-demuxer(full).
 *   - clip.3gp / clip.3g2 (3gp, §A.2) — read by ffmpeg-wasm, mp4box (3gp-family), web-demuxer(custom build).
 *   - clip.caf  (caf, §A.2) — read by ffmpeg-wasm.
 *   - clip.ogv  (ogv, §A.2) — read by ffmpeg-wasm (Ogg video).
 *   - anim.gif  (gif-as-video, §A.2) — read by ffmpeg-wasm (GIF demuxer / animated GIF).
 *     (Engines lacking each container negotiate NA honestly; the case is only worth emitting once the
 *      asset+golden exist so at least one engine is correctness-gated on it.)
 *
 *  DEGENERATE / EXTREME EDGES (§A.16) — no asset, all need a tiny generated fixture + golden:
 *   - degenerate_1x1.mp4 (and/or degenerate_0x0.*) — assert width/height reported EXACTLY at the
 *       degenerate boundary (dims comparison at 1×1 / 0×0).
 *   - extreme_fps_1.mp4   — 1-fps clip: assert fps==1 (stresses the fixed-0.05 absolute fps tolerance).
 *   - extreme_fps_240.mp4 — 240-fps clip: assert fps≈240; the fixed 0.05 ABSOLUTE fps tolerance in
 *       compareTrack (oracles.ts) is too tight here (239.7 vs 240 → Δ0.3 FAILs a correct engine), so a
 *       240fps golden should declare a NOMINAL-fps tolerance OR the oracle should go relative at high fps.
 *   - mislabeled_h264_es.webm — an H.264 elementary stream with a .webm name/MIME: assert the engine
 *       reports the TRUE container/codec from CONTENT, not the label (tests resolveContainer's
 *       extension-fallback path directly).
 *   - audio_5_1_layout.<mp4|wav> — 5.1 layout: assert channels==6 (compareTrack channels at an unusual layout).
 *   - ts_pts_discontinuity.ts — MPEG-TS with a PTS discontinuity/wraparound: assert the aggregated
 *       duration stays sane (exercises the documented loose-TS estimate band on a DISCONTINUOUS stream,
 *       not just a clean TS).
 *
 *  ORACLE GAPS (NOT writable here — they live in src/core/oracles.ts / engine.ts, outside this writer's
 *  scope — but recorded so the probe cases that DEPEND on them are not mistaken for fully gated):
 *   - goldenMetadata ignores track.rotation: the h264_rotated90.mp4 case above relies on the dims diff
 *       (unrotated w/h) to catch a w/h swap; a true rotation-field assertion needs a compareTrack
 *       rotation check (NormalizedTrack has `rotation?`).
 *   - goldenMetadata ignores track.language: the h264_multitrack.mp4 case's "language must match" is
 *       NOT enforced (compareTrack omits language).
 *   - goldenMetadata ignores the container-level tags map (NormalizedMetadata.tags) — metadata-family
 *       READ cases reuse this same oracle for title/artist/etc. and silently pass regardless of tags.
 *   - goldenMetadata never asserts an encryption scheme: the cenc_ctr/cenc_cbcs/hls_aes128 probe notes
 *       say "reports encryption scheme", but neither the type nor the oracle carries an encryption field,
 *       so that part of the probe contract is currently unverifiable (over-claim unless the type+oracle add it).
 *   - duration golden-null-vs-measured-present is NOT flagged (an engine that fabricates a duration for a
 *       legitimately-null container — headerless WebM, raw ADTS — is not caught).
 * ──────────────────────────────────────────────────────────────────────────────────────────────────
 */
