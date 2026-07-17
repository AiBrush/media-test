/**
 * src/scenarios/demux/index.ts — Pillar 1, family "demux".
 *
 * Demux MP4/MOV/WebM/MKV/TS/HLS + audio containers and judge both semantic packet evidence and
 * normalized metadata against committed, independent evidence. DTS is optional observation coverage:
 * adapters that do not expose it never substitute PTS, while adapters declaring `packets:dts` are
 * held to the complete decode timeline.
 *
 * The battery is built in sub-blocks, all framework-blind (a case never names a library) and all
 * cited against committed golden the offline bake produced from ffprobe (`fixtures/golden/<asset>.packets.json`):
 *
 *   (1) CORE format-axis     — every container/codec the corpus has golden-packets for: MP4/MOV/MKV/
 *       WebM/TS, HEVC, 4K, rotated/display-matrix, VP9-with-alpha, B-frames, VFR, multi-track, HLS
 *       (VOD + AES-128), and the audio-elementary set (ADTS, OGG/Opus, FLAC ±SEEKTABLE, MP3 Xing &
 *       CBR-no-TOC, WAV s16/s24/f32, big-endian AIFF PCM). Oracle: `golden-packets`.
 *   (2) SIZE-LADDER (§5.3)   — the same demux op crossed with the size axis: micro/tiny/large/huge/
 *       massive assets so the packet table is verified at every scale, not just small/medium. The
 *       multi-hour `massive` asset is memory/longtask-gated (peakMemory + longtasks metrics + a hard
 *       timeout) to surface a non-lazy / OOM-prone demuxer. Oracle: `golden-packets`.
 *   (3) DEGENERATE / NO-TRACKS — an empty-but-valid audio container that must demux to exactly zero
 *       packets cleanly (golden is `[]`), proving an engine reports "no packets" rather than crashing
 *       or fabricating. Oracle: `golden-packets` (0 == 0 passes).
 *   (4) GRACEFUL-FAILURE     — zero-length and header-truncated containers fed to demux from concrete
 *       fixture files. The engine must reject/handle cleanly within the timeout. Oracle:
 *       `graceful-failure`.
 *   (5) METAMORPHIC FLAC ±SEEKTABLE — execute both inputs on the same candidate and compare their
 *       semantic FLAC frame inventories/timelines directly. Oracle: `property-invariant`.
 *   (6) OMITTED AXES — committed fragmented MP4/CMAF, mislabeled-extension, gapless AAC, TS
 *       discontinuity, and CAF/PCM inputs carry both metadata and packet evidence.
 */

import type { MetricId, Scenario } from '../../core/scenario.ts';
import { defineScenario } from '../../core/scenario.ts';
import { FLAC_SEEKTABLE_INVARIANT, defineDemuxScaleContract } from '../../features/demux/index.ts';
import { defineRobustnessContract } from '../robustness/contracts.ts';

// ── (1) CORE format-axis cases (each backed by golden/<asset>.packets.json) ──────────────────────

interface DemuxCase {
  id?: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  videoCodecsIn?: string[];
  audioCodecs?: string[];
  encryption?: ('cenc-ctr' | 'cenc-cbcs' | 'hls-aes128')[];
  features?: string[];
  notes?: string;
}

const DEMUX_CASES: DemuxCase[] = [
  // ── MP4 / MOV ──
  { asset: 'h264_1080p_30s.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] },
  {
    id: 'realworld_mdn_flower_mp4',
    asset: 'realworld_mdn_flower.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Real-world fetched corpus smoke: MDN CC0 flower.mp4. Golden-packets ensures the downloaded MP4 ' +
      'actually demuxes into the expected H.264/AAC packet table.',
  },
  {
    asset: 'h264_bframes_1080p.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'B-frames: dts < pts on reordered frames — golden encodes the exact dts/pts spread.',
  },
  {
    asset: 'h264_vfr.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'VFR: uneven inter-packet pts deltas; demux must preserve per-sample timestamps verbatim.',
  },
  {
    asset: 'h264_multitrack.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Multiple tracks: packets must carry correct trackIndex; golden interleaves both tracks.',
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
      'Real-world fetched corpus smoke: MDN CC0 flower.webm. Golden-packets validates VP8/Vorbis packet ' +
      'enumeration from a browser-documentation sample.',
  },
  { asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] },
  {
    asset: 'av1_720p_5s.webm',
    container: 'webm',
    videoCodecsIn: ['av1'],
    audioCodecs: ['opus'],
    notes:
      'AV1 read-side demux: requires input AV1 parsing/packet walking, not AV1 encode capability.',
  },
  { asset: 'h264_in_mkv.mkv', container: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] },

  // ── TS ──
  {
    asset: 'h264_ts.ts',
    container: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'MPEG-TS: PES timestamps in 90kHz clock; demux normalizes pts/dts to µs for the golden.',
  },

  // ── Audio-only single-track demux ──
  { asset: 'aac_adts.aac', container: 'adts', audioCodecs: ['aac'], notes: 'ADTS frame boundaries → audio packets.' },
  {
    asset: 'aac_audio_only.m4a',
    container: 'mp4',
    audioCodecs: ['aac'],
    notes:
      'Raw AAC access units in MP4/AudioSpecificConfig counterpart to aac_adts.aac: transport headers ' +
      'must not be confused with coded-audio frame identity.',
  },
  { asset: 'opus.ogg', container: 'ogg', audioCodecs: ['opus'], notes: 'OGG page → Opus packet boundaries.' },
  { asset: 'flac_seektable.flac', container: 'flac', audioCodecs: ['flac'] },

  // ── MP4/MOV format-axis the corpus has golden for but demux previously skipped ──
  {
    asset: 'hevc_1080p_10s.mp4',
    container: 'mp4',
    videoCodecs: ['hevc'],
    audioCodecs: ['aac'],
    notes:
      'HEVC/H.265 demux: hvcC-described stream; the packet table (sizes/keyframes/dts<pts) must match ' +
      'golden exactly. Browser-codec-gated engines that cannot configure HEVC report NA(browser), not FAIL.',
  },
  {
    asset: 'h264_4k_10s.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: '4K H.264: large per-packet sizes; verifies the size column at high resolution against golden.',
  },
  {
    asset: 'h264_rotated90.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Rotated / display-matrix demux: rotation is a track-display property and must NOT perturb the ' +
      'packet table — trackIndex/keyframe/sizes/pts under a 90° matrix must match golden verbatim.',
  },
  {
    asset: 'vp9_alpha.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes:
      'VP9-with-alpha demux: BlockAdditions (alpha) ride the same video packets; demux must enumerate ' +
      'exactly the golden packet table (no double-counting the alpha side-data as separate packets).',
  },

  // ── HLS playlist demux (golden exists; the family previously ignored HLS) ──
  {
    asset: 'hls_vod.m3u8',
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'HLS VOD playlist demux: segments are walked and PES packets recovered across .ts segment ' +
      'boundaries; golden encodes the unwrapped 90kHz origin (first pts 1421333µs). Engines without ' +
      'HLS-playlist demux report NA(engine).',
  },
  {
    asset: 'hls_aes128.m3u8',
    container: 'hls',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    encryption: ['hls-aes128'],
    notes:
      'HLS AES-128 playlist demux: #EXT-X-KEY segments must be decrypted before the PES packet table ' +
      'is recovered; golden matches the plaintext packet table. Engines without HLS-AES report NA.',
  },

  // ── Audio-elementary format-axis the corpus has golden for but demux previously skipped ──
  {
    asset: 'flac_noseektable.flac',
    container: 'flac',
    audioCodecs: ['flac'],
    notes:
      'FLAC WITHOUT a SEEKTABLE block: frame enumeration must come from the bitstream itself, not a ' +
      'seek index. Golden has the same 105 frames as flac_seektable — see the metamorphic pair below.',
  },
  {
    asset: 'mp3_xing.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes: 'MP3 elementary demux with a Xing/Info TOC header: the TOC frame must not be emitted as audio data.',
  },
  {
    id: 'realworld_mdn_trex_mp3',
    asset: 'realworld_mdn_trex.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes:
      'Real-world fetched corpus smoke: MDN CC0 t-rex-roar.mp3. Golden-packets validates frame walking ' +
      'against an authentic downloaded MP3, not only generated sine-wave fixtures.',
  },
  {
    asset: 'mp3_cbr_notoc.mp3',
    container: 'mp3',
    audioCodecs: ['mp3'],
    notes: 'MP3 CBR with NO Xing TOC: frame boundaries derived purely by constant-bitrate frame walking.',
  },
  {
    asset: 'wav_s16.wav',
    container: 'wav',
    audioCodecs: ['pcm-s16'],
    notes: 'WAV PCM s16le: the PCM data chunk must be sliced into the golden frame→packet boundaries.',
  },
  {
    asset: 'wav_s24.wav',
    container: 'wav',
    audioCodecs: ['pcm-s24'],
    notes: 'WAV PCM s24: 3-byte sample packing must not corrupt packet size boundaries.',
  },
  {
    asset: 'wav_f32.wav',
    container: 'wav',
    audioCodecs: ['pcm-f32'],
    notes: 'WAV PCM f32: float sample packing; packet sizes must match golden frame boundaries.',
  },
  {
    asset: 'pcm_s16be.aiff',
    container: 'aiff',
    audioCodecs: ['pcm-s16be'],
    notes:
      'AIFF big-endian PCM single-track demux (the previous audio set omitted AIFF entirely). Engines ' +
      "that don't read AIFF (e.g. mediabunny lists AIFF as unsupported) report a clean NA(engine).",
  },

  // ── Previously omitted, now backed by digest-bound assets + metadata/packet evidence ──
  {
    id: 'fragmented_cmaf',
    asset: 'fragmented_cmaf.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Fragmented MP4/CMAF-style input: empty moov plus moof/mdat media fragments must expose the ' +
      'complete semantic packet timeline and metadata, not only progressive sample tables.',
  },
  {
    id: 'mislabeled_h264',
    asset: 'mislabeled_h264.webm',
    container: 'mp4',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'Mislabeled-container detection: the .webm extension lies, while digest-bound bytes and golden ' +
      'identify MP4/H.264/AAC. Engines must sniff/parse content rather than trust the filename.',
  },
  {
    id: 'gapless_aac',
    asset: 'gapless_aac.m4a',
    container: 'mp4',
    audioCodecs: ['aac'],
    notes:
      'Gapless AAC priming/padding: packet PTS/duration and semantic metadata preserve the edit-list ' +
      'presentation timeline for a deliberately non-frame-aligned source duration.',
  },
  {
    id: 'ts_discontinuity',
    asset: 'ts_discontinuity.ts',
    container: 'ts',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes:
      'MPEG-TS splice discontinuity: preserve both timeline epochs without hanging, wrapping negative, ' +
      'or flattening the ~597s forward discontinuity.',
  },
  {
    id: 'pcm_s16_caf',
    asset: 'pcm_s16.caf',
    container: 'caf',
    audioCodecs: ['pcm-s16'],
    notes: 'CAF/PCM input coverage: judge packet inventory plus sample-rate/channel/duration metadata.',
  },
];

const coreScenarios: Scenario[] = DEMUX_CASES.map((c) =>
  defineScenario({
    id: `demux/${c.id ?? c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'demux',
    input: c.asset,
    requires: {
      operations: ['demux'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.videoCodecsIn ? { videoCodecsIn: c.videoCodecsIn } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
      ...(c.encryption ? { encryption: c.encryption } : {}),
      ...(c.features ? { features: c.features } : {}),
    },
    oracles: ['golden-packets', 'golden-metadata'],
    metrics: ['wall'],
    ...(c.notes ? { notes: c.notes } : {}),
  }),
);

// ── (2) SIZE-LADDER cases — demux crossed with the §5.3 size axis ────────────────────────────────

interface SizeCase {
  asset: string;
  container: string;
  bucket: 'micro' | 'tiny' | 'large' | 'huge' | 'massive';
  videoCodecs?: string[];
  audioCodecs?: string[];
  /** memory/longtask-gated (the multi-hour / many-thousand-sample rungs); adds peakMemory+longtasks+timeout. */
  memoryGated?: boolean;
  notes: string;
}

/** Big assets can legitimately take a while to walk every packet; gate them so a stall is a clean FAIL. */
const LARGE_DEMUX_TIMEOUT_MS = 120_000;
const HUGE_DEMUX_TIMEOUT_MS = 600_000;
/** Memory/read/long-task evidence for the at-scale rungs (vs the default `wall`-only). */
const SCALE_METRICS: MetricId[] = ['wall', 'peakMemory', 'sourceReads', 'longtasks'];

const SIZE_CASES: SizeCase[] = [
  // micro (~1 KB / 1 frame) — header/edge robustness of the packet walk at the smallest valid size.
  {
    asset: 'micro_h264_1frame.mp4',
    container: 'mp4',
    bucket: 'micro',
    videoCodecs: ['h264'],
    notes: 'Micro: a single-frame H.264 MP4 must demux to exactly one keyframe packet (golden has 1).',
  },
  {
    asset: 'micro_audio_short.m4a',
    container: 'mp4',
    bucket: 'micro',
    audioCodecs: ['aac'],
    notes:
      'Micro audio: a 6-packet AAC-in-MP4 with encoder-delay priming (golden first pts -23220µs). The ' +
      'per-track constant-origin tolerance in the oracle absorbs the edit-list/priming shift.',
  },
  // tiny (~100 KB) — probe/demux latency + the format axis at small size.
  {
    asset: 'tiny_h264_360p_2s.mp4',
    container: 'mp4',
    bucket: 'tiny',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    notes: 'Tiny 360p H.264/AAC: two-track packet table at small scale (golden 60 video + 95 audio).',
  },
  {
    asset: 'tiny_vp9_360p_2s.webm',
    container: 'webm',
    bucket: 'tiny',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    notes: 'Tiny 360p VP9/Opus WebM: crosses the WebM format axis at tiny size (golden 60 video + 101 audio).',
  },
  // large (~100 MB / 120 s) — sustained throughput + memory of the packet walk.
  {
    asset: 'large_h264_1080p_120s.mp4',
    container: 'mp4',
    bucket: 'large',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    memoryGated: true,
    notes:
      'Large 120s 1080p H.264: the demux must stream the packet table without buffering the whole file; ' +
      'peakMemory/longtasks are recorded. Generated by a non-skip-longform bake — NA(asset-missing) until present.',
  },
  {
    asset: 'large_vp9_1080p_120s.webm',
    container: 'webm',
    bucket: 'large',
    videoCodecs: ['vp9'],
    audioCodecs: ['opus'],
    memoryGated: true,
    notes:
      'Large 120s 1080p VP9: WebM cluster walk at scale; peakMemory/longtasks recorded. ' +
      'NA(asset-missing) until the longform bake produces it + golden.',
  },
  // huge (~500–700 MB) — metadata/packet-iterate at scale (parity with the published chart).
  {
    asset: 'huge_h264_1080p_600s.mov',
    container: 'mov',
    bucket: 'huge',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    memoryGated: true,
    notes:
      'Huge 600s 1080p H.264 MOV: packet-iterate at the BigBuckBunny scale; a non-lazy demux shows up as ' +
      'peakMemory/longtasks blow-up here. NA(asset-missing) until the (slow) bake produces it + golden.',
  },
  // massive (multi-hour / many-thousand-sample) — lazy-read / OOM-resistance (A.16 line 459).
  {
    asset: 'massive_h264_1080p_2h.mp4',
    container: 'mp4',
    bucket: 'massive',
    videoCodecs: ['h264'],
    audioCodecs: ['aac'],
    memoryGated: true,
    notes:
      'Massive multi-hour (~2 h) 1080p H.264 with many-thousand samples: the OOM-resistance / lazy-read ' +
      'demux case (distinct from the perf iterate-video-packets throughput case). The packet table must be ' +
      'enumerable without scanning/buffering the whole file; peakMemory/longtasks + a hard timeout gate it. ' +
      'NA(asset-missing) until the long-low-bitrate bake produces it + golden.',
  },
];

const sizeScenarios: Scenario[] = SIZE_CASES.map((c) =>
  defineScenario({
    id: `demux/size_${c.bucket}_${c.asset.replace(/\.[^.]+$/, '')}`,
    op: 'demux',
    input: c.asset,
    requires: {
      operations: ['demux'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: [
      'golden-packets',
      'golden-metadata',
      ...(c.memoryGated ? ['property-invariant' as const] : []),
    ],
    // At-scale rungs retain explicit, machine-readable memory/read/long-task/first+last-packet
    // thresholds. Full scans may compete, but cannot silently present themselves as lazy reads.
    metrics: c.memoryGated ? SCALE_METRICS : ['wall'],
    ...(c.memoryGated
      ? {
          timeoutMs: demuxTimeoutForBucket(c.bucket),
          options: {
            invariant: 'demux-scale-budgets',
            robustness: defineDemuxScaleContract(c.bucket as 'large' | 'huge' | 'massive'),
          },
        }
      : {}),
    notes: c.notes,
  }),
);

function demuxTimeoutForBucket(bucket: SizeCase['bucket']): number {
  return bucket === 'huge' || bucket === 'massive' ? HUGE_DEMUX_TIMEOUT_MS : LARGE_DEMUX_TIMEOUT_MS;
}

// ── (3) DEGENERATE / NO-TRACKS — empty-but-valid container demuxes to exactly 0 packets ──────────

const emptyAudioDemux: Scenario = defineScenario({
  id: 'demux/empty_audio_zero_packets',
  op: 'demux',
  input: 'empty_audio.wav',
  requires: { operations: ['demux'], containersIn: ['wav'], audioCodecs: ['pcm-s16'] },
  // golden/empty_audio.wav.packets.json is `[]` — a valid container with no audio data. golden-packets
  // passes iff the engine returns exactly zero packets (0 measured == 0 golden), so an engine that
  // fabricates a phantom packet or crashes on an empty data chunk FAILs.
  oracles: ['golden-packets', 'golden-metadata'],
  metrics: ['wall'],
  notes:
    'No-tracks/empty demux: a valid WAV whose PCM data chunk is empty must demux to ZERO packets cleanly ' +
    '(golden is []), never crash and never fabricate a packet.',
});

// ── (4) GRACEFUL-FAILURE — zero-length / header-truncated demux must reject cleanly ──────────────

const GRACEFUL_TIMEOUT_MS = 15_000;

interface GracefulCase {
  id: string;
  asset: string;
  container: string;
  videoCodecs?: string[];
  audioCodecs?: string[];
  gracefulAllowOutput?: boolean;
  notes: string;
}

const GRACEFUL_CASES: GracefulCase[] = [
  {
    id: 'graceful_zero_length',
    asset: 'zero_length.mp4',
    container: 'mp4',
    notes:
      'Zero-length container fed to demux: an empty file is not parseable, so demux must reject/handle ' +
      'cleanly (throw/reject) within the timeout — never hang or crash.',
  },
  {
    asset: 'truncated_h264.mp4',
    id: 'graceful_truncated_h264',
    container: 'mp4',
    videoCodecs: ['h264'],
    gracefulAllowOutput: true,
    notes:
      'Header-truncated H.264 MP4 (the corpus truncated_h264.mp4 is already a partial/broken file): demux ' +
      'must reject cleanly or yield a clean partial+EOF, never a corrupt packet table or a hang.',
  },
  {
    id: 'graceful_mp4_header_destroyed',
    asset: 'demux_mp4_header_destroyed.mp4',
    container: 'mp4',
    videoCodecs: ['h264'],
    notes:
      'Valid MP4 with its first 256 bytes (ftyp/moov head) dropped: demux must fail gracefully — the ' +
      'header is gone so no sane packet table can be produced.',
  },
  {
    id: 'graceful_webm_header_destroyed',
    asset: 'demux_webm_header_destroyed.webm',
    container: 'webm',
    videoCodecs: ['vp9'],
    notes:
      'Valid WebM with its EBML header (first 128 bytes) destroyed: demux must reject cleanly, never ' +
      'loop on a mangled element size.',
  },
];

const gracefulScenarios: Scenario[] = GRACEFUL_CASES.map((c) =>
  defineScenario({
    id: `demux/${c.id}`,
    op: 'demux',
    input: c.asset,
    requires: {
      operations: ['demux'],
      containersIn: [c.container],
      ...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
      ...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
    },
    oracles: ['graceful-failure'],
    metrics: ['wall', 'peakMemory'],
    options: {
      ...(c.gracefulAllowOutput ? { gracefulAllowOutput: true } : {}),
      robustness: defineRobustnessContract(
        c.gracefulAllowOutput ? 'boundary' : 'negative',
        'packet-structure',
        ['graceful-failure'],
        GRACEFUL_TIMEOUT_MS,
      ),
    },
    timeoutMs: GRACEFUL_TIMEOUT_MS,
    notes: c.notes,
  }),
);

// ── (5) METAMORPHIC — packets(flac_noseektable) == packets(flac_seektable) ───────────────────────

/** Both inputs are executed by the same candidate; the property compares their outputs directly. */
const flacSeektableMetamorphic: Scenario = defineScenario({
  id: 'demux/metamorphic_flac_seektable_invariance',
  op: 'demux',
  input: ['flac_seektable.flac', 'flac_noseektable.flac'],
  inputs: [
    { assetId: 'flac_seektable.flac', variantId: 'with-seektable', role: 'with-seektable' },
    { assetId: 'flac_noseektable.flac', variantId: 'without-seektable', role: 'without-seektable' },
  ],
  inputVariantIds: ['with-seektable', 'without-seektable'],
  requires: { operations: ['demux'], containersIn: ['flac'], audioCodecs: ['flac'] },
  options: { invariant: FLAC_SEEKTABLE_INVARIANT },
  oracles: ['property-invariant'],
  metrics: ['wall'],
  notes:
    'Metamorphic demux(flac_seektable)==demux(flac_noseektable): execute both inputs, normalize their ' +
    'semantic FLAC frame inventories/timelines, and compare directly. SEEKTABLE metadata may differ; ' +
    'dropping or changing any audio frame fails.',
});

// ── battery ──────────────────────────────────────────────────────────────────────────────────────

export const demuxScenarios: Scenario[] = [
  ...coreScenarios,
  ...sizeScenarios,
  emptyAudioDemux,
  ...gracefulScenarios,
  flacSeektableMetamorphic,
];

export default demuxScenarios;
