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
 * COVERAGE DECISIONS (REQ-FEAT-39): executable rows below cover fragmented MP4/CMAF, CAF, 1x1,
 * 1/240 fps, mislabeled content, 5.1 audio, and TS discontinuity using present assets and goldens.
 * Every remaining historical gap has a reasoned, versioned OUT_OF_SCOPE record in
 * src/features/probe/coverage.ts; no missing-asset scenario is registered as fake coverage.
 */

import type { MetricId, OracleId, OracleTolerances, Scenario } from '../../core/scenario.ts';
import type { EncryptionScheme } from '../../core/engine.ts';
import { defineScenario } from '../../core/scenario.ts';
import {
  HLS_PLAYLIST_ONLY_CONTRACT,
  HLS_PROTECTED_SEGMENT_CONTRACT,
  PROBE_SCALE_BUDGETS,
  RECORDER_HEADERLESS_DURATION_CONTRACT,
  defineProbeMetadataFieldPolicy,
  type ProbeBudgetContract,
  type ProbeMetadataFieldPolicy,
} from '../../features/probe/index.ts';

// ── (A) per-container golden-metadata probes ─────────────────────────────────────────────────────

/** One probe scenario per asset. `containersIn` + codec hints make NA-negotiation honest. */
interface ProbeCase {
  id?: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  videoCodecsIn?: string[];
  audioCodecs?: string[];
  encryption?: EncryptionScheme[];
  features?: string[];
  options?: Record<string, unknown>;
  probeContract?: Record<string, unknown>;
  tolerances?: OracleTolerances;
  notes?: string;
}

const DECLARED_METADATA_POLICIES: Readonly<Record<string, ProbeMetadataFieldPolicy>> = Object.freeze({
  'h264_1080p_30s.mp4': defineProbeMetadataFieldPolicy({ fields: ['tags'], tagKeys: ['major_brand'] }),
  'h264_rotated90.mp4': defineProbeMetadataFieldPolicy({ fields: ['track.rotation'] }),
  'big_buck_bunny_1080p_h264.mov': defineProbeMetadataFieldPolicy({ fields: ['track.language'] }),
  'wav_s16.wav': defineProbeMetadataFieldPolicy({
    fields: ['track.bitrate'],
    bitrateRelativeTolerance: 0,
  }),
  'cenc_ctr_fragmented.mp4': defineProbeMetadataFieldPolicy({
    fields: ['protection.scheme'],
    protectionSchemes: ['cenc'],
  }),
  'cenc_cbcs.mp4': defineProbeMetadataFieldPolicy({
    fields: ['protection.scheme'],
    protectionSchemes: ['cbcs'],
  }),
});

const EMPTY_DURATION_NULLABILITY_POLICY = defineProbeMetadataFieldPolicy({
  fields: ['duration-nullability'],
  zeroDurationEquivalentToUnknown: true,
});

const SCALE_BUDGET_BY_ASSET: Readonly<Record<string, ProbeBudgetContract>> = Object.freeze({
  'large_h264_1080p_120s.mp4': PROBE_SCALE_BUDGETS.large,
  'large_vp9_1080p_120s.webm': PROBE_SCALE_BUDGETS.large,
  'huge_h264_1080p_600s.mov': PROBE_SCALE_BUDGETS.huge,
  'huge_vp9_1080p_240s.webm': PROBE_SCALE_BUDGETS.huge,
  'big_buck_bunny_1080p_h264.mov': PROBE_SCALE_BUDGETS.huge,
  'massive_h264_1080p_2h.mp4': PROBE_SCALE_BUDGETS.massive,
  'massive_vp9_1080p_2h.webm': PROBE_SCALE_BUDGETS.massive,
});

function scenarioProbeOptions(
  asset: string,
  existing?: Record<string, unknown>,
  probeContract?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadataFieldPolicy = DECLARED_METADATA_POLICIES[asset];
  const probeBudget = SCALE_BUDGET_BY_ASSET[asset];
  const hlsResourceIndex = asset === 'hls_vod.m3u8'
    ? 'fixtures/golden/hls_vod.m3u8.resources.json'
    : probeContract?.schema === 'media-test/hls-protected-segment-probe@1'
      ? 'fixtures/golden/hls_aes128.m3u8.resources.json'
      : undefined;
  if (!existing && !metadataFieldPolicy && !probeBudget && !probeContract && !hlsResourceIndex) return undefined;
  return {
    ...(existing ?? {}),
    robustness: {
      probe: {
        schema: 'media-test/probe-scenario-contract@1',
        ...(metadataFieldPolicy ? { metadataFieldPolicy } : {}),
        ...(probeBudget ? { probeBudget } : {}),
        ...(probeContract ? { probeContract } : {}),
        ...(hlsResourceIndex ? { hlsResourceIndex } : {}),
      },
    },
  };
}

const PROBE_CASES: ProbeCase[] = [
  // ── Video MP4 / MOV ──
  { asset: 'h264_1080p_30s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    id: 'realworld_mdn_flower_mp4',
    asset: 'realworld_mdn_flower.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Real-world fetched corpus smoke: MDN CC0 flower.mp4 from sourceUrl in manifest. Prevents the ' +
      'MP4 probe axis from relying only on ffmpeg-generated test patterns.',
  },
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
    tolerances: { fpsTolerance: 0.1 },
    notes: 'Variable frame rate — fps is nominal/average; oracle uses a VFR-specific average-fps tolerance.',
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
    notes: 'Multiple tracks: golden lists every logical track; semantic type-bucket matching keeps a stream-array reorder a PASS (recorded representation difference), not FAIL.',
  },
  { asset: 'h264_1080p_5s.mov', container: 'mov', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── WebM / MKV ──
  { asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] },
  {
    id: 'realworld_mdn_flower_webm',
    asset: 'realworld_mdn_flower.webm',
    container: 'webm',
    videoCodecs: ['vp8'],
    audioCodecs: ['vorbis'],
    notes:
      'Real-world fetched corpus smoke: MDN CC0 flower.webm from sourceUrl in manifest. Exercises a ' +
      'browser-documentation WebM instead of generated testsrc media.',
  },
  { asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  {
    asset: 'av1_720p_5s.webm',
    container: 'webm',
    videoCodecsIn: ['av1'],
    audioCodecs: ['opus'],
    notes:
      'AV1 read-side probe: uses videoCodecsIn so software engines that can parse/decode/copy AV1 but ' +
      'cannot encode AV1 are not falsely hidden behind an encode-capability gate.',
  },
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
    // Full protected-segment row. Unlike the playlist-only row below, track details require reading
    // and decrypting media and therefore explicitly require the key resource.
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    features: ['hls:aes128', 'probe:resource-trace'],
    probeContract: HLS_PROTECTED_SEGMENT_CONTRACT as unknown as Record<string, unknown>,
    notes:
      'AES-128 HLS protected-segment probe: container, track, and codec details require decrypting at ' +
      'least one media segment with the declared key. A denied/missing key is NA_ASSET, not FAIL/ERROR.',
  },

  // ── Encrypted MP4 (probe of the encrypted container, no key needed) ──
  {
    id: 'cenc_ctr',
    asset: 'cenc_ctr_fragmented.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption: ['cenc-ctr'],
    features: ['metadata:protected-tracks'],
    notes:
      'Probe-owned fully fragmented CENC ctr: probe reports protected MP4 track metadata ' +
      '(container/tracks/duration/scheme) without decrypting. The legacy cenc_ctr.mp4 remains ' +
      'reserved for encryption/decrypt scenarios.',
  },
  {
    asset: 'cenc_cbcs.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption: ['cenc-cbcs'],
    features: ['metadata:protected-tracks'],
    notes:
      'CENC cbcs: probe reports protected MP4 track metadata without decrypting; no decrypt key is ' +
      'needed for metadata-only validation.',
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
    id: 'realworld_mdn_trex_mp3',
    asset: 'realworld_mdn_trex.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    tolerances: { durationToleranceSec: 0.05 },
    notes:
      'Real-world fetched corpus smoke: MDN CC0 t-rex-roar.mp3 from sourceUrl in manifest. Complements ' +
      'the synthetic sine-wave MP3 fixtures. Uses a narrow 50ms duration band for MP3 encoder-delay/' +
      'padding estimation differences; packet walking is separately gated by demux/realworld_mdn_trex_mp3.',
  },
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
    tolerances: { fpsTolerance: 0.25 },
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

  // ── Executable former coverage gaps (REQ-FEAT-39) ──
  {
    asset: 'fragmented_cmaf.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Fragmented MP4/CMAF: committed init+media fixture with moov plus moof/mdat. Probe must recover ' +
      'tracks and presentation duration from the fragmented structure.',
  },
  {
    id: 'pcm_s16_caf',
    asset: 'pcm_s16.caf',
    container: 'caf',
    audioCodecs: ['pcm-s16'],
    notes: 'CAF container coverage with deterministic 48 kHz stereo signed-16 PCM and present metadata golden.',
  },
  {
    asset: 'video_1x1.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    notes: 'Degenerate valid dimension boundary: report coded width=1 and height=1 exactly.',
  },
  {
    asset: 'h264_1fps_30s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    notes: 'Extreme low cadence: report the committed CFR 1 fps value rather than treating it as absent.',
  },
  {
    asset: 'video_240fps.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    tolerances: { fpsTolerance: 1.2 },
    notes:
      'Extreme high cadence: report nominal/observed 240 fps; the explicit 0.5% band avoids a fixed ' +
      'low-rate absolute tolerance while still rejecting a materially wrong cadence.',
  },
  {
    id: 'mislabeled_h264_content',
    asset: 'mislabeled_h264.webm',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Mislabeled content: .webm name/MIME wraps real ISO BMFF H.264/AAC bytes. Probe must report ' +
      "content-derived container 'mp4', never trust the suffix fallback.",
  },
  {
    asset: 'wav_5_1.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    notes: 'WAVEFORMATEXTENSIBLE 5.1 edge: report six channels exactly.',
  },
  {
    asset: 'ts_discontinuity.ts',
    container: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'MPEG-TS discontinuity edge: aggregate the presented timeline across the authored timestamp ' +
      'jump without overflow, negative duration, or suffix-derived metadata.',
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
    options: { metadataTrackTypes: ['video', 'audio'] },
    notes:
      'huge bucket (~500-700 MB) self-contained big-read .mov. Probe reads header without scanning media. ' +
      'Only media tracks are compared because the real-source candidates also contain auxiliary QuickTime ' +
      'tmcd data tracks, which are outside the normalized probe media-track contract.',
  },
  {
    asset: 'huge_vp9_1080p_240s.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'huge bucket VP9/WebM twin. Keeps the huge rung cross-family instead of H.264-only.',
  },
  {
    // HUGE big-read PARITY twin (the real Big Buck Bunny 1080p H.264 .mov Mediabunny benchmarks).
    // 'provided' (drop-in / pin-then-fetch): NA(asset-missing) until present, then golden-gated.
    asset: 'big_buck_bunny_1080p_h264.mov',
    container: 'mov',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    options: { metadataTrackTypes: ['video', 'audio'] },
    notes:
      'huge/big-read PARITY (real Big Buck Bunny 1080p H.264 .mov). provided drop-in — NA(asset-missing) ' +
      'until dropped at fixtures/media/; the synthetic huge_h264_1080p_600s.mov keeps the rung populated. ' +
      'Only media tracks are compared here; non-media timecode/data tracks are covered by metadata-specific cases.',
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
  {
    asset: 'massive_vp9_1080p_2h.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'massive bucket VP9/WebM twin. Exercises long-form lazy probe behavior outside ISOBMFF.',
  },
];

const goldenProbeScenarios: Scenario[] = PROBE_CASES.map((c) =>
  defineScenario({
    id: `probe/${c.id ?? c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'probe',
    input: c.asset,
    requires: {
      operations: ['probe'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.videoCodecsIn ? { videoCodecsIn: c.videoCodecsIn } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.encryption ? { encryption: c.encryption } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['golden-metadata'],
    metrics: SCALE_BUDGET_BY_ASSET[c.asset] ? ['wall', 'peakMemory'] : ['wall'],
    ...(scenarioProbeOptions(c.asset, c.options, c.probeContract)
      ? { options: scenarioProbeOptions(c.asset, c.options, c.probeContract) }
      : {}),
    ...(c.tolerances ? { tolerances: c.tolerances } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

/**
 * Key-free HLS is deliberately a separate, narrower observation than protected segment probing.
 * The oracle reads EXTINF/EXT-X-KEY from the digest-verified playlist and asserts no segment/key
 * resource was read; it never infers codec or track details that the media playlist cannot prove.
 */
const hlsAes128PlaylistOnlyProbe: Scenario = defineScenario({
  id: 'probe/hls_aes128_playlist_key_free',
  op: 'probe',
  input: 'hls_aes128.m3u8',
  requires: {
    operations: ['probe'],
    containersIn: ['hls'],
    features: ['hls:aes128', 'probe:resource-trace'],
  },
  oracles: ['property-invariant'],
  metrics: ['wall'],
  options: {
    invariant: 'hls-playlist-only-probe',
    property: 'hls-playlist-only-probe',
    robustness: {
      probe: {
        schema: 'media-test/probe-scenario-contract@1',
        probeContract: HLS_PLAYLIST_ONLY_CONTRACT,
      },
    },
  },
  notes:
    'AES-128 HLS playlist-only contract: assert only the EXTINF duration sum and EXT-X-KEY ' +
    'protection signaling. Codec/track details are intentionally absent, and segment/key reads fail ' +
    'this key-free row. Full track inspection remains probe/hls_aes128 and explicitly requires the key.',
});

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
  options?: Record<string, unknown>;
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
    options: { metadataTrackTypes: ['video', 'audio'] },
    notes:
      'Headline §8.1 at HUGE scale: repeated metadata extraction on the self-contained ~500-700 MB ' +
      'big-read .mov. Score = probes/sec; correctness gated by golden-metadata for video/audio tracks. ' +
      'Auxiliary QuickTime tmcd tracks in real-source candidates are not part of this media-track headline. ' +
      'Faststart moov keeps a correct probe a cheap front-of-file read even at huge size.',
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
    metrics: [OPS_PER_SEC, 'wall', 'peakMemory'],
    primaryMetric: OPS_PER_SEC,
    options: scenarioProbeOptions(c.asset, c.options)!,
    notes: c.notes,
  }),
);

// ── (D) METAMORPHIC (§A.16): probe(x).dur consistent across containers of identical content ────────

/**
 * Property-invariant probe case: the SAME underlying H.264/AAC elementary streams delivered in two containers
 * must probe to the SAME duration within tolerance. The `property-invariant` oracle's 'probe-duration'
 * branch (oracles.ts) compares the probed duration against the golden/source duration. Multi-input
 * (the runner probes each container and compares). This mirrors robustness's
 * prop_duration_consistent_across_containers but as a first-class PROBE-family metamorphic case so the
 * invariant is exercised in the probe pillar, not only in robustness.
 *
 * `fixtures/golden/probe-duration-equivalent-wrappers.json` records identical stream-copy SHA-256
 * hashes for both video and audio streams. The oracle records every per-input golden delta and the
 * order-independent maximum direct wrapper delta.
 */
const probeDurationInvariant: Scenario = defineScenario({
  id: 'probe/metamorphic-duration-across-containers',
  op: 'probe',
  input: ['h264_rotated90.mp4', 'h264_in_mkv.mkv'],
  requires: {
    operations: ['probe'],
    containersIn: ['mp4', 'mkv'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
  },
  oracles: ['property-invariant'],
  options: {
    invariant: 'probe-duration-cross-wrapper',
    property: 'probe-duration',
    robustness: {
      probe: {
        schema: 'media-test/probe-scenario-contract@1',
        wrapperEquivalenceEvidence: 'fixtures/golden/probe-duration-equivalent-wrappers.json',
        wrapperEquivalenceSha256: '9c83b15031c504dafea40e2a53f5b7d7a1f886947a5f5bc177fcbcf3c5236c01',
      },
    },
  },
  metrics: ['wall'],
  notes:
    'Metamorphic (§A.16): MP4 and Matroska wrappers carry byte-identical H.264/AAC elementary ' +
    'streams (committed hash evidence). Compare each duration to its golden and compare measured ' +
    'wrappers directly; a shifted wrapper fails even if an unrelated golden could otherwise pass.',
});

/**
 * Headerless-MediaRecorder-WebM "sane duration" gate (§A.16). §A.16 says a headerless recorder WebM
 * must still report a SANE duration; the existing golden-metadata probe case accepts a null duration
 * (golden-null path) because such a stream legitimately lacks a Segment Duration. This metamorphic
 * case ADDITIONALLY gates that IF the engine reports a non-null duration, it is within the
 * content-derived packet-span bound.
 * So "sane duration" is actually exercised rather than silently waived.
 *
 * The committed metadata duration remains null; the separate packet evidence supplies a 2.98 s
 * observed span and the scenario explicitly declares the allowed tail/rounding allowance.
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
  options: {
    invariant: 'probe-headerless-sane-duration',
    property: 'probe-duration',
    robustness: {
      probe: {
        schema: 'media-test/probe-scenario-contract@1',
        probeContract: RECORDER_HEADERLESS_DURATION_CONTRACT,
      },
    },
  },
  metrics: ['wall'],
  notes:
    'Metamorphic (§A.16) "sane duration": null is explicitly valid; a finite estimate is a PASS with a recorded representation difference and ' +
    'must be non-negative, finite, and no larger than the committed 2.98s packet span plus a 0.5s ' +
    'tail/rounding allowance. NaN, infinity, negative, or larger values fail.',
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
  options: {
    robustness: {
      probe: {
        schema: 'media-test/probe-scenario-contract@1',
        metadataFieldPolicy: EMPTY_DURATION_NULLABILITY_POLICY,
      },
    },
  },
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
  options: { gracefulAllowOutput: true },
  timeoutMs: HEADER_TRUNCATED_TIMEOUT_MS,
  notes:
    'Deep edge (§A.16): header-truncated PROBE (incomplete moov/mdat). Probe must reject cleanly or ' +
    'return partial-but-safe metadata — never crash/hang/OOM. Mirrors the demux header-truncation ' +
    'fuzz, proving probe fails gracefully too. graceful-failure oracle; timeout-guarded.',
});

// ── battery ──────────────────────────────────────────────────────────────────────────────────────

export const probeScenarios: Scenario[] = [
  ...goldenProbeScenarios,
  hlsAes128PlaylistOnlyProbe,
  ...perfProbeScenarios,
  probeDurationInvariant,
  recorderHeaderlessSaneDuration,
  emptyAudioProbe,
  truncatedHeaderProbe,
];

export default probeScenarios;

/*
 * The former free-form DECLARED GAPS list is intentionally gone. Every axis is now either an
 * executable scenario above or a reasoned, versioned OUT_OF_SCOPE record in
 * src/features/probe/coverage.ts. The coverage audit forbids scenario records whose asset or metadata
 * golden is absent, so no permanent NA_ASSET row can masquerade as implemented coverage.
 */
