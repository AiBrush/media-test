/**
 * src/scenarios/transcode/index.ts — Pillar 1, family "transcode".
 *
 * Lossy re-encode. Pixels change, so correctness is judged by perceptual similarity to the
 * reference frames: `ssim-psnr` with floors {ssimMin: 0.99} (tunable per scenario),
 * plus a `playback-smoke`. Coverage is the codec matrix (h264/hevc/vp8/vp9/av1 video;
 * aac/opus/mp3/flac/pcm audio), plus the spatial/temporal/bitrate/rotate transforms, plus a
 * fan-out/ABR ladder (one input → N renditions, each SSIM-validated).
 *
 * Each scenario's `requires` declares both the input codec(s)/container and the *output* codec(s)/
 * container/features so the runner negotiates NA correctly when a browser lacks an encoder.
 */

import type { TranscodeOptions } from "../../core/engine.ts";
import type {
	CandidateInputEnvelope,
	OracleId,
	OracleTolerances,
	Scenario,
} from "../../core/scenario.ts";
import { defineScenario } from "../../core/scenario.ts";
import { LARGE_1080P_120S_CANDIDATE_ENVELOPE } from "../_candidate-envelopes.ts";
import { defineRobustnessContract } from "../robustness/contracts.ts";

/** SSIM is the gate. PSNR remains advisory until both decoded pixel planes are observable. */
const TC_TOL: OracleTolerances = { ssimMin: 0.99 };

/**
 * Browser/WebCodecs transcodes routinely quantize encoded duration by a few frames when changing FPS
 * or baking rotation. Keep the band small enough that large truncation/drift still fails.
 */
const TC_REENCODE_DURATION_TOLERANCE_SEC = 0.15;

/** A 1 fps CFR output quantizes its authored duration to whole-frame boundaries. */
const TC_ONE_FPS_DURATION_TOLERANCE_SEC = 1;

/** AAC/Opus/MP3 encoder-delay + padding allowance for lossy audio targets. */
const TC_AUDIO_PRIMING_TOLERANCE_SEC = 0.12;

const TC_METRICS = [
	"wall",
	"throughputRealtime",
	"peakMemory",
	"longtasks",
] as const;

/** Tight wall-clock cap (ms) for edge/negative cases that must fail fast (no crash/hang/OOM). */
const TC_EDGE_TIMEOUT_MS = 20_000;

/**
 * Transcode option payload. Some extended cases carry knobs beyond the core TranscodeOptions shape
 * (e.g. `invariant` for the property-invariant oracle, or a not-yet-supported transform like
 * `flip`/`crop`/`tonemap` that drives an honest NA). The runner forwards options opaquely and the
 * scenario `options` field is `TranscodeOptions | Record<string, unknown>`, so we widen here.
 */
type TranscodeOpts = TranscodeOptions & Record<string, unknown>;

const withOutputMetadataInvariant = (
	opts: TranscodeOptions | TranscodeOpts,
): TranscodeOpts => ({
	...opts,
	invariant: "transcode-output-metadata",
});

const withAudioContentInvariant = (
	opts: TranscodeOptions | TranscodeOpts,
): TranscodeOpts => ({
	...opts,
	invariant: "transcode-audio-content",
});

// ── Video codec transcode matrix ────────────────────────────────────────────────────────────────

interface VideoTranscodeCase {
	id: string;
	/** Increment whenever this stable scenario id changes semantic options/oracles/tolerances. */
	revision?: number;
	asset: string;
	fromContainer: string;
	fromVideo: string;
	fromAudio?: string;
	toContainer: string;
	/** target video codec (canonical token) */
	toVideo: string;
	/** target audio codec, if the audio is also re-encoded; omit to keep/copy audio */
	toAudio?: string;
	/** extra features the op needs (resize/fps/rotate/alpha) */
	features?: string[];
	opts: TranscodeOpts;
	tolerances?: OracleTolerances;
	/** replace the default ['ssim-psnr','playback-smoke'] oracle list entirely (order significant). */
	oraclesOverride?: OracleId[];
	/** append extra oracles to the default list (e.g. 'property-invariant' for output metadata). */
	extraOracles?: OracleId[];
	/** when property-invariant is in the oracle list, the invariant token it interprets. */
	optsInvariant?: string;
	candidateEnvelope?: CandidateInputEnvelope;
	notes?: string;
}

const VIDEO_CASES: VideoTranscodeCase[] = [
	// ── Cross-codec re-encode (same resolution), H.264 source → each target codec ──
	{
		id: "h264_to_hevc_mp4",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "hevc",
		opts: { container: "mp4", video: { codec: "hevc" } },
		tolerances: { ssimMin: 0.97 },
	},
	{
		id: "h264_to_vp9_webm",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp9",
		toAudio: "opus",
		opts: {
			container: "webm",
			video: { codec: "vp9" },
			audio: { codec: "opus" },
		},
		tolerances: { ssimMin: 0.98 },
		notes:
			"mp4/H.264/AAC → webm/VP9/Opus: container forces audio re-encode to Opus too; the 0.98 " +
			"cross-codec floor reflects Chromium VP9 color/quantization behavior on the exhaustive corpus.",
	},
	{
		id: "h264_to_vp8_webm",
		asset: "tiny_h264_360p_2s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp8",
		toAudio: "vorbis",
		opts: {
			container: "webm",
			video: { codec: "vp8" },
			audio: { codec: "vorbis" },
		},
		tolerances: { ssimMin: 0.97 },
		notes:
			"Tiny MP4/H.264/AAC → WebM/VP8/Vorbis: keeps the VP8/Vorbis output row inside the browser-wasm budget.",
	},
	{
		id: "h264_to_av1_mp4",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "av1",
		opts: { container: "mp4", video: { codec: "av1" } },
		tolerances: { ssimMin: 0.97 },
		notes:
			"AV1 encode is slow/SW on most browsers; expect NA where no AV1 encoder is configurable.",
	},

	// ── Reverse direction: modern codecs → H.264 (the universal baseline) ──
	{
		id: "hevc_to_h264_mp4",
		asset: "hevc_1080p_10s.mp4",
		fromContainer: "mp4",
		fromVideo: "hevc",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		opts: { container: "mp4", video: { codec: "h264" } },
		tolerances: { ssimMin: 0.98 },
	},
	{
		id: "vp9_to_h264_mp4",
		asset: "vp9_1080p_10s.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		fromAudio: "opus",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		opts: {
			container: "mp4",
			video: { codec: "h264" },
			audio: { codec: "aac" },
		},
		tolerances: { ssimMin: 0.98 },
	},
	{
		id: "vp8_to_h264_mp4",
		asset: "vp8_720p_10s.webm",
		fromContainer: "webm",
		fromVideo: "vp8",
		fromAudio: "vorbis",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		opts: {
			container: "mp4",
			video: { codec: "h264" },
			audio: { codec: "aac" },
		},
		tolerances: { ssimMin: 0.98 },
	},
	{
		id: "av1_to_h264_mp4",
		asset: "av1_720p_5s.webm",
		fromContainer: "webm",
		fromVideo: "av1",
		fromAudio: "opus",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		opts: {
			container: "mp4",
			video: { codec: "h264" },
			audio: { codec: "aac" },
		},
		tolerances: { ssimMin: 0.98 },
	},

	// ── Resize (downscale + upscale) ──
	{
		id: "h264_resize_720p",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["resize"],
		opts: {
			container: "mp4",
			video: { codec: "h264", width: 1280, height: 720 },
		},
		// Reference frames for SSIM are the same content scaled to 720p; keep floors but slightly relaxed.
		tolerances: { ssimMin: 0.97 },
		notes: "Downscale 1080p→720p; SSIM computed against reference 720p frames.",
	},
	{
		id: "h264_resize_4k_to_1080p",
		asset: "h264_4k_10s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["resize"],
		opts: {
			container: "mp4",
			video: { codec: "h264", width: 1920, height: 1080 },
		},
		tolerances: { ssimMin: 0.98 },
		notes: "4K→1080p downscale.",
	},
	{
		id: "video_only_h264_resize_360p_to_vp9_webm",
		asset: "h264_video_only.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		toContainer: "webm",
		toVideo: "vp9",
		features: ["resize", "mediarecorder:video-only"],
		opts: {
			container: "webm",
			video: { codec: "vp9", width: 640, height: 360, bitrate: 4_000_000 },
		},
		tolerances: { ssimMin: 0.93 },
		notes:
			"Video-only browser-native transcode coverage: uses the corpus h264_video_only.mp4 fixture so " +
			"platform can exercise its real canvas→MediaRecorder path without falsely claiming audio preservation.",
	},

	// ── FPS change (temporal resample) ──
	{
		id: "h264_fps_30_to_15",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["fps"],
		opts: { container: "mp4", video: { codec: "h264", fps: 15 } },
		oraclesOverride: ["property-invariant", "playback-smoke"],
		optsInvariant: "transcode-output-metadata",
		tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
		notes:
			"Frame-rate halved (30→15). Index-paired SSIM is unsound for frame dropping, so output metadata " +
			"checks requested fps/container/codec and preserves duration within a small re-encode band.",
	},
	{
		id: "h264_vfr_to_cfr_30",
		asset: "h264_vfr.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["fps"],
		opts: { container: "mp4", video: { codec: "h264", fps: 30 } },
		oraclesOverride: ["property-invariant", "playback-smoke"],
		optsInvariant: "transcode-output-metadata",
		tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
		notes:
			"VFR → constant 30fps; tests timestamp normalization during encode. Output metadata is the hard " +
			"gate because index-paired SSIM mis-pairs VFR/CFR frame timelines.",
	},

	// ── Bitrate target (quality knob) ──
	{
		id: "h264_bitrate_2mbps",
		revision: 4,
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["quality-constrained-rate"],
		opts: {
			container: "mp4",
			video: {
				codec: "h264",
				bitrate: 2_000_000,
				maxAverageBitrate: 2_600_000,
				quality: { metric: "ssim-luma-v1", minimumMean: 0.93, samples: 8 },
			},
		},
		oraclesOverride: [
			"ssim-psnr",
			"average-bitrate",
			"property-invariant",
			"playback-smoke",
		],
		optsInvariant: "transcode-preserve-omitted-aac",
		// Aggressive bitrate cuts lower fidelity, so quality remains an independent mandatory gate.
		tolerances: { ssimMin: 0.93 },
		notes:
			"Prefer 2 Mbps while allowing at most the independently authored 1.3× elementary-rate ceiling " +
			"only when needed to satisfy the explicit ssim-luma-v1 mean >= 0.93 constraint; independent " +
			"average-bitrate, endpoint-inclusive SSIM, byte-exact omitted-AAC preservation, and playback " +
			"oracles remain conjunctive.",
	},

	// ── Rotate (apply/normalize display rotation) ──
	{
		id: "h264_rotate_normalize",
		asset: "h264_rotated90.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["rotate"],
		opts: { container: "mp4", video: { codec: "h264", rotate: 0 } },
		extraOracles: ["property-invariant"],
		optsInvariant: "transcode-effect-aware",
		tolerances: { ssimMin: 0.98 },
		notes:
			"Bake the 270° clockwise display rotation into pixels (rotate→0); effect-aware pixels and authored " +
			"rotation signaling are mandatory in addition to the perceptual reference.",
	},
];

/**
 * Build one video transcode Scenario from a VideoTranscodeCase. Default oracle set is
 * ['ssim-psnr','playback-smoke']; `oraclesOverride` replaces it wholesale and `extraOracles` appends.
 * When the oracle list includes 'property-invariant', `optsInvariant` is merged into options as
 * `invariant` so the oracle selects the right (sound) metamorphic check.
 */
function buildVideoScenario(c: VideoTranscodeCase): Scenario {
	const oracles: OracleId[] = c.oraclesOverride
		? [...c.oraclesOverride]
		: ["ssim-psnr", "playback-smoke", ...(c.extraOracles ?? [])];
	const options: TranscodeOpts =
		c.optsInvariant &&
		(c.opts as Record<string, unknown>).invariant === undefined
			? { ...c.opts, invariant: c.optsInvariant }
			: c.opts;
	return defineScenario({
		id: `transcode/${c.id}`,
		...(c.revision ? { revision: c.revision } : {}),
		op: "transcode",
		input: c.asset,
		options,
		requires: {
			operations: ["transcode"],
			containersIn: [c.fromContainer],
			containersOut: [c.toContainer],
			videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
			...(c.fromAudio || c.toAudio
				? {
						audioCodecs: [
							...new Set(
								[c.fromAudio, c.toAudio].filter((x): x is string => !!x),
							),
						],
					}
				: {}),
			...(c.features ? { features: c.features } : {}),
		},
		oracles,
		metrics: [...TC_METRICS],
		tolerances: c.tolerances ?? TC_TOL,
		...(c.candidateEnvelope ? { candidateEnvelope: c.candidateEnvelope } : {}),
		...(c.notes ? { notes: c.notes } : {}),
	});
}

const videoScenarios: Scenario[] = VIDEO_CASES.map(buildVideoScenario);

// ── Audio-only transcode matrix ─────────────────────────────────────────────────────────────────

/**
 * Audio re-encode. SSIM/PSNR are video-only, so these rows use the transcode audio-content
 * invariant: a neutral reader gates container/codec/channel/rate, decoded PCM gates content, and
 * AAC/Opus delay is trimmed only from authored timing evidence. Browser-playable containers also
 * get a playback smoke check.
 */
interface AudioTranscodeCase {
	id: string;
	asset: string;
	fromContainer: string;
	fromAudio: string;
	toContainer: string;
	toAudio: string;
	opts: TranscodeOptions;
	lossless?: boolean;
	notes?: string;
}

const AUDIO_CASES: AudioTranscodeCase[] = [
	{
		id: "wav_to_aac_mp4",
		asset: "wav_s16.wav",
		fromContainer: "wav",
		fromAudio: "pcm-s16",
		toContainer: "mp4",
		toAudio: "aac",
		opts: { container: "mp4", audio: { codec: "aac", bitrate: 192_000 } },
	},
	{
		id: "wav_to_opus_ogg",
		asset: "wav_s16.wav",
		fromContainer: "wav",
		fromAudio: "pcm-s16",
		toContainer: "ogg",
		toAudio: "opus",
		opts: { container: "ogg", audio: { codec: "opus", bitrate: 128_000 } },
	},
	{
		id: "wav_to_flac",
		asset: "wav_s16.wav",
		fromContainer: "wav",
		fromAudio: "pcm-s16",
		toContainer: "flac",
		toAudio: "flac",
		opts: { container: "flac", audio: { codec: "flac" } },
		lossless: true,
		notes:
			"Lossless target: neutral FLAC structure plus decoded PCM equality after the declared program window.",
	},
	{
		id: "mp3_to_aac_mp4",
		asset: "mp3_xing.mp3",
		fromContainer: "mp3",
		fromAudio: "mp3",
		toContainer: "mp4",
		toAudio: "aac",
		opts: { container: "mp4", audio: { codec: "aac", bitrate: 192_000 } },
	},
	{
		id: "flac_to_aac_mp4",
		asset: "flac_seektable.flac",
		fromContainer: "flac",
		fromAudio: "flac",
		toContainer: "mp4",
		toAudio: "aac",
		opts: { container: "mp4", audio: { codec: "aac", bitrate: 256_000 } },
	},
	{
		id: "aac_to_opus_webm",
		asset: "aac_adts.aac",
		fromContainer: "adts",
		fromAudio: "aac",
		toContainer: "webm",
		toAudio: "opus",
		opts: { container: "webm", audio: { codec: "opus", bitrate: 128_000 } },
	},
];

const audioScenarios: Scenario[] = AUDIO_CASES.map((c) => {
	const browserPlayable = c.toContainer === "mp4" || c.toContainer === "webm";
	const oracles: OracleId[] = ["property-invariant"];
	if (browserPlayable) oracles.push("playback-smoke");
	return defineScenario({
		id: `transcode/${c.id}`,
		op: "transcode",
		input: c.asset,
		options: withAudioContentInvariant(c.opts),
		requires: {
			operations: ["transcode"],
			containersIn: [c.fromContainer],
			containersOut: [c.toContainer],
			audioCodecs: [...new Set([c.fromAudio, c.toAudio])],
		},
		oracles,
		metrics: ["wall", "throughputRealtime", "peakMemory", "longtasks"],
		...(c.notes ? { notes: c.notes } : {}),
	});
});

// ── Fan-out / ABR ladder (one input → N renditions) ──────────────────────────────────────────────

/**
 * ABR fan-out via TranscodeOptions.variants: the engine must surface every requested quality rung.
 * The fanout-renditions oracle validates every rendition independently and then validates the set's
 * authored bitrate bands, timebase/duration, random-access alignment, and decoded adjacent switches.
 * Requires both 'fanout' and 'quality-constrained-rate' so engines without either contract negotiate NA.
 */
const ABR_OPTS: TranscodeOptions = {
	container: "mp4",
	video: { codec: "h264" },
	variants: [
		{
			codec: "h264",
			width: 1920,
			height: 1080,
			bitrate: 5_000_000,
			maxAverageBitrate: 6_500_000,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.95, samples: 8 },
		},
		{
			codec: "h264",
			width: 1280,
			height: 720,
			bitrate: 2_800_000,
			maxAverageBitrate: 3_640_000,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.95, samples: 8 },
		},
		{
			codec: "h264",
			width: 854,
			height: 480,
			bitrate: 1_400_000,
			maxAverageBitrate: 1_820_000,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.95, samples: 8 },
		},
		{
			codec: "h264",
			width: 640,
			height: 360,
			bitrate: 800_000,
			maxAverageBitrate: 1_040_000,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.95, samples: 8 },
		},
	],
	renditionSet: {
		id: "h264-main-abr",
		renditionIds: ["1080p", "720p", "480p", "360p"],
		// The current non-fragmented ladder guarantees a shared random-access boundary at presentation
		// start. Later switching points require an authored periodic-GOP/segment request and are not implied.
		switchPointsUs: [0],
		segmentMode: "random-access",
	},
};

const fanoutScenarios: Scenario[] = [
	defineScenario({
		id: "transcode/fanout_h264_abr_ladder",
		revision: 3,
		op: "transcode",
		input: "h264_1080p_30s.mp4",
		options: ABR_OPTS,
		requires: {
			operations: ["transcode"],
			containersIn: ["mp4"],
			containersOut: ["mp4"],
			videoCodecs: ["h264"],
			audioCodecs: ["aac"],
			features: ["fanout", "resize", "quality-constrained-rate"],
		},
		oracles: ["fanout-renditions"],
		metrics: [...TC_METRICS],
		tolerances: { ssimMin: 0.95 },
		renditionIds: ["1080p", "720p", "480p", "360p"],
		notes:
			"Explicit H.264 ABR set (1080/720/480/360): each authored preferred rate has an independent " +
			"1.3x hard ceiling and ssim-luma-v1 mean >= 0.95 objective; every rendition must also satisfy " +
			"validity, bitrate, common-timebase, aligned random-access, and cross-rendition switching contracts.",
	}),
];

// ════════════════════════════════════════════════════════════════════════════════════════════════
// EXTENDED COVERAGE — the missing matrix rows + deep/metamorphic edges (test-instructions §A.5/§A.6/
// §A.8/§A.16/§5.3). Each block below is written to be CORRECTNESS-FIRST and HONEST about its oracle:
//
//  • Where a transform is expressible through the existing TranscodeOptions vocabulary (a target
//    codec, width/height, fps, bitrate, rotate, channels) it requires NO new capability token, so it
//    negotiates a real run on any engine that declares the in/out codec+container, and is gated by an
//    oracle that actually runs (ssim-psnr / alpha-plane / property-invariant).
//
//  • Where a transform needs a knob NO adapter declares (flip / crop / pad / letterbox / colour-space
//    convert / HDR→SDR tone-map / two-pass / CRF-quality / 8↔10-bit / HDR10), the scenario tags that
//    knob as a `features` requirement using a descriptive token. No engine declares those tokens, so
//    the case negotiates NA_ENGINE *honestly* (rule §0.1: a clean NA is correct; an over-claimed PASS
//    on an unobserved knob is the sin). These slots exist so the spec's A.8/A.16 transform matrix is
//    REPRESENTED and any future engine that gains the knob lights the cell up automatically — they are
//    deliberately not faked green. HDR rows still have no PQ/HDR source fixture; 10-bit rows remain
//    NA on the undeclared depth-control feature even though the corpus now has a 10-bit H.264 decode
//    fixture.
//
//  • The fps-change and rotate-dimension-swap reference oracles are known to mis-pair in the no-golden
//    path (index-paired, not pts-/rotation-aware — see oracles.ssimVsReferenceSource). For those cases
//    the GATING oracle is the one that is actually sound (property-invariant output metadata, which
//    reference-probes the engine output and is rotation/temporal-agnostic). ssim-psnr is omitted where
//    the reference path would mis-pair frames or ignore rotation.
// ════════════════════════════════════════════════════════════════════════════════════════════════

// ── A.5 — cross-codec ENCODE matrix (the non-H.264 targets the catalog implies) ───────────────────
//
// The base VIDEO_CASES only fan H.264→{hevc,vp9,vp8,av1} out and only ever target H.264 on the
// reverse leg. These add the inter-modern-codec encodes (HEVC/VP9/VP8/AV1 as ENCODE targets) so no
// codec is exercised solely as a decode source. Same resolution (no resize feature needed); gated by
// ssim-psnr against the in-browser reference decode of the source.
const CROSS_CODEC_CASES: VideoTranscodeCase[] = [
	{
		id: "hevc_to_vp9_webm",
		asset: "hevc_1080p_10s.mp4",
		fromContainer: "mp4",
		fromVideo: "hevc",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp9",
		toAudio: "opus",
		opts: {
			container: "webm",
			video: { codec: "vp9" },
			audio: { codec: "opus" },
		},
		tolerances: { ssimMin: 0.97 },
		notes:
			"HEVC→VP9 (WebM forces AAC→Opus). NA(browser) where HEVC decode is unavailable.",
	},
	{
		id: "hevc_to_av1_webm",
		asset: "hevc_1080p_10s.mp4",
		fromContainer: "mp4",
		fromVideo: "hevc",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "av1",
		toAudio: "opus",
		opts: {
			container: "webm",
			video: { codec: "av1" },
			audio: { codec: "opus" },
		},
		tolerances: { ssimMin: 0.97 },
		notes:
			"HEVC→AV1: both ends are browser/HW-gated; expect NA on engines/browsers lacking either.",
	},
	{
		id: "hevc_to_vp8_webm",
		asset: "hevc_1080p_10s.mp4",
		fromContainer: "mp4",
		fromVideo: "hevc",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp8",
		toAudio: "vorbis",
		opts: {
			container: "webm",
			video: { codec: "vp8" },
			audio: { codec: "vorbis" },
		},
		tolerances: { ssimMin: 0.97 },
		notes: "HEVC→VP8 (oldest WebM video codec) + Vorbis audio.",
	},
	{
		id: "vp9_to_av1_webm",
		asset: "vp9_1080p_10s.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		fromAudio: "opus",
		toContainer: "webm",
		toVideo: "av1",
		opts: { container: "webm", video: { codec: "av1" } },
		tolerances: { ssimMin: 0.97 },
		notes:
			"VP9→AV1, audio copied (Opus→Opus). AV1 encode is SW/slow → NA where no encoder.",
	},
	{
		id: "vp9_to_vp8_webm",
		asset: "vp9_1080p_10s.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		fromAudio: "opus",
		toContainer: "webm",
		toVideo: "vp8",
		toAudio: "vorbis",
		opts: {
			container: "webm",
			video: { codec: "vp8" },
			audio: { codec: "vorbis" },
		},
		tolerances: { ssimMin: 0.97 },
		notes: "VP9→VP8 down-generation within WebM; Opus→Vorbis.",
	},
	{
		id: "vp8_to_vp9_webm",
		asset: "recorder_headerless.webm",
		fromContainer: "webm",
		fromVideo: "vp8",
		fromAudio: "opus",
		toContainer: "webm",
		toVideo: "vp9",
		toAudio: "opus",
		opts: {
			container: "webm",
			video: { codec: "vp9" },
			audio: { codec: "opus" },
		},
		tolerances: { ssimMin: 0.97 },
		notes:
			"VP8→VP9 up-generation from the captured VP8/Opus WebM fixture. The older VP8/Vorbis corpus " +
			"assets remain parser coverage, but Chromium exposes no WebCodecs Vorbis decode path for transcode.",
	},
	{
		id: "av1_to_vp9_webm",
		asset: "av1_720p_5s.webm",
		fromContainer: "webm",
		fromVideo: "av1",
		fromAudio: "opus",
		toContainer: "webm",
		toVideo: "vp9",
		opts: { container: "webm", video: { codec: "vp9" } },
		tolerances: { ssimMin: 0.97 },
		notes:
			"AV1→VP9 within WebM, audio copied. NA(browser) where AV1 decode is absent.",
	},
];

// ── A.8 — fps UP-conversion / interpolation (down-conversion already covered: h264_fps_30_to_15) ──
//
// fps changes are judged by output metadata (requested fps/container/codec + duration preservation).
// ssim-psnr is intentionally NOT attached: the no-golden reference path pairs frames by index, which
// frame dropping/interpolation shifts, so it would mis-score a CORRECT result.
const FPS_UP_CASES: VideoTranscodeCase[] = [
	{
		id: "h264_fps_15_to_30",
		asset: "h264_vfr.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["fps"],
		opts: {
			container: "mp4",
			video: { codec: "h264", fps: 30 },
			invariant: "transcode-output-metadata",
		},
		oraclesOverride: ["property-invariant", "playback-smoke"],
		tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
		notes:
			'fps UP-convert toward 30 (A.8 "fps change up/interpolate"). Gated by duration-preservation ' +
			"and requested output metadata; index-paired SSIM is unsound for interpolation so it is omitted.",
	},
	{
		id: "h264_fps_30_to_60",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["fps"],
		opts: {
			container: "mp4",
			video: { codec: "h264", fps: 60 },
			invariant: "transcode-output-metadata",
		},
		oraclesOverride: ["property-invariant", "playback-smoke"],
		tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
		notes:
			"30→60 fps up-sample; requested output fps and duration are validated by the output-metadata invariant.",
	},
];

// ── A.8 — rotate APPLY 90/180/270, incl. the dimension-swapping orientations (A.16 trap) ──────────
//
// The source-reference SSIM path applies the requested quarter-turn in display space, independently
// of the property oracle's typed transform implementation. Every rotation therefore has both a
// perceptual gate and the authored signaling/dimension/effect gate.
const ROTATE_CASES: VideoTranscodeCase[] = [
	{
		id: "h264_rotate_180",
		revision: 2,
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["rotate"],
		opts: { container: "mp4", video: { codec: "h264", rotate: 180 } },
		oraclesOverride: ["ssim-psnr", "property-invariant", "playback-smoke"],
		optsInvariant: "transcode-effect-aware",
		tolerances: {
			ssimMin: 0.95,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes:
			"Apply 180° rotation. The effect-aware oracle rotates source pixels and checks authored " +
			"rotation signaling; playback/codec alone cannot satisfy the row.",
	},
	{
		id: "h264_rotate_90_dimswap",
		revision: 2,
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["rotate"],
		opts: { container: "mp4", video: { codec: "h264", rotate: 90 } },
		oraclesOverride: ["ssim-psnr", "property-invariant", "playback-smoke"],
		optsInvariant: "transcode-effect-aware",
		tolerances: {
			ssimMin: 0.95,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes:
			"Apply 90° rotation with W↔H swap. Timestamp-paired transformed pixels and authored rotation " +
			"signaling are the gate; a dimension-only or playback-only implementation fails.",
	},
	{
		id: "h264_rotate_270_dimswap",
		revision: 2,
		asset: "h264_rotated90.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["rotate"],
		opts: { container: "mp4", video: { codec: "h264", rotate: 270 } },
		oraclesOverride: ["ssim-psnr", "property-invariant", "playback-smoke"],
		optsInvariant: "transcode-effect-aware",
		tolerances: {
			ssimMin: 0.95,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes:
			"Apply 270° rotation to the pre-rotated asset. The effect-aware reference validates the " +
			"compounded display pixels and normalized authored matrix independently of playback.",
	},
];

const crossCodecScenarios: Scenario[] =
	CROSS_CODEC_CASES.map(buildVideoScenario);
const fpsUpScenarios: Scenario[] = FPS_UP_CASES.map(buildVideoScenario);
const rotateScenarios: Scenario[] = ROTATE_CASES.map(buildVideoScenario);

// ── A.8 — transform/control rows gated by explicit adapter feature declarations ───────────────────
//
// flip / crop / pad / letterbox / colour-space convert (601↔709↔2020) / HDR→SDR tone-map / two-pass /
// CRF-quality. Each row tags the exact `features` token it needs; engines that do not declare the
// token stay honest NA_ENGINE, while adapters that implement the knob run the row normally. The input
// is a real upright H.264 asset so the cell becomes live as soon as an engine declares support.
interface TransformFeatureCase {
	id: string;
	revision?: number;
	/** the descriptive, intentionally-undeclared capability token driving the honest NA */
	feature: string;
	/** option payload an engine WOULD receive once it supports the knob (forwarded as-is) */
	extraOpts?: Record<string, unknown>;
	oracles?: OracleId[];
	tolerances?: OracleTolerances;
	timeoutMs?: number;
	notes: string;
	asset?: string;
	fromContainer?: string;
	fromVideo?: string;
	fromAudio?: string;
	toContainer?: string;
	toVideo?: string;
}

const TRANSFORM_FEATURE_CASES: TransformFeatureCase[] = [
	{
		id: "h264_flip_horizontal",
		feature: "flip",
		extraOpts: { flip: "h", invariant: "transcode-effect-aware" },
		oracles: ["ssim-psnr", "property-invariant", "playback-smoke"],
		notes:
			"Horizontal flip: transformed pixels are the gate; a no-op adapter fails.",
	},
	{
		id: "h264_flip_vertical",
		feature: "flip",
		extraOpts: { flip: "v", invariant: "transcode-effect-aware" },
		oracles: ["ssim-psnr", "property-invariant", "playback-smoke"],
		notes:
			"Vertical flip: transformed pixels are the gate; a no-op adapter fails.",
	},
	{
		id: "h264_crop_center",
		feature: "crop",
		extraOpts: {
			video: { codec: "h264", width: 1440, height: 810 },
			crop: { x: 240, y: 135, width: 1440, height: 810 },
			invariant: "transcode-effect-aware",
		},
		oracles: ["ssim-psnr", "property-invariant", "playback-smoke"],
		tolerances: {
			ssimMin: 0.93,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes:
			'Center crop (A.8 crop). Requires a declared "crop" feature; pixel gate uses a transform-aware ' +
			"reference plus output metadata for cropped dimensions.",
	},
	{
		id: "h264_pad_letterbox_4x3_to_16x9",
		feature: "pad",
		asset: "vp9_alpha.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		fromAudio: "",
		toContainer: "mp4",
		toVideo: "h264",
		extraOpts: {
			video: { codec: "h264", width: 1280, height: 720 },
			pad: { width: 1280, height: 720, color: "black" },
			invariant: "transcode-effect-aware",
		},
		oracles: ["ssim-psnr", "property-invariant", "playback-smoke"],
		notes:
			"Pad the real 640x480 (4:3) fixture into 1280x720 (16:9); black bars and retained source " +
			"pixels are both observed, so a no-op cannot pass.",
	},
	{
		id: "h264_colorspace_709_to_2020",
		feature: "colorspace",
		extraOpts: {
			colorspace: { from: "bt709", to: "bt2020" },
			invariant: "transcode-effect-aware",
		},
		oracles: ["property-invariant", "playback-smoke"],
		notes:
			"BT.709→BT.2020 conversion requires transformed pixels plus primaries/transfer/matrix/range " +
			"signaling. A codec-correct no-op fails; a valid alternate mapping is a PASS with a recorded representation difference.",
	},
	{
		id: "h264_crf_quality_mode",
		feature: "crf",
		extraOpts: {
			video: { codec: "h264", crf: 23 },
			invariant: "transcode-output-metadata",
		},
		oracles: ["property-invariant", "playback-smoke"],
		tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
		notes:
			'CRF/quality-rate-control mode (A.8 CRF/quality). Requires a declared "crf" feature; the row ' +
			"gates output shape/playback because CRF 23 intentionally changes perceptual quality.",
	},
	{
		id: "h264_two_pass_bitrate",
		revision: 3,
		feature: "two-pass",
		extraOpts: {
			video: {
				codec: "h264",
				bitrate: 2_000_000,
				maxAverageBitrate: 2_600_000,
				quality: { metric: "ssim-luma-v1", minimumMean: 0.93, samples: 8 },
				passes: 2,
			},
		},
		oracles: ["ssim-psnr", "average-bitrate", "playback-smoke"],
		tolerances: { ssimMin: 0.93 },
		timeoutMs: 300_000,
		notes:
			'Two-pass average-bitrate control (A.8 two-pass). Requires a declared "two-pass" feature; ' +
			"uses the same explicit preferred-rate, hard-rate, and perceptual floor as the 2 Mbps one-pass row.",
	},
];

const transformFeatureScenarios: Scenario[] = TRANSFORM_FEATURE_CASES.map((c) =>
	defineScenario({
		id: `transcode/${c.id}`,
		...(c.revision !== undefined ? { revision: c.revision } : {}),
		op: "transcode",
		input: c.asset ?? "h264_1080p_30s.mp4",
		options: {
			container: c.toContainer ?? "mp4",
			video: { codec: c.toVideo ?? "h264" },
			...(c.extraOpts ?? {}),
		},
		requires: {
			operations: ["transcode"],
			containersIn: [c.fromContainer ?? "mp4"],
			containersOut: [c.toContainer ?? "mp4"],
			videoCodecs: [...new Set([c.fromVideo ?? "h264", c.toVideo ?? "h264"])],
			...(c.fromAudio === "" ? {} : { audioCodecs: [c.fromAudio ?? "aac"] }),
			features: [c.feature],
		},
		// Spatial transforms gate on a transform-aware SSIM reference; rate-control rows can override.
		oracles: c.oracles ?? ["ssim-psnr", "playback-smoke"],
		metrics: [...TC_METRICS],
		tolerances: c.tolerances ?? { ssimMin: 0.97 },
		...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
		notes: c.notes,
	}),
);

// ── A.5 — 8↔10-bit & HDR10 ENCODE slots ───────────────────────────────────────────────────────────
//
// The suite keeps output-depth encode, source-depth down-convert, and HDR tone-map separate:
// ffmpeg.wasm can validate the available 10-bit H.264 source by encoding an 8-bit output, and the
// tone-map row uses a tiny real BT.2020/PQ HEVC source so a browser-wasm engine can run it inside the
// suite budget. HEVC-10 output encode remains beyond the stable browser-wasm path.
interface DepthHdrCase {
	id: string;
	asset: string;
	fromContainer: string;
	fromVideo: string;
	toContainer: string;
	toVideo: string;
	feature: string;
	extraOpts?: Record<string, unknown>;
	oracles?: OracleId[];
	tolerances?: OracleTolerances;
	timeoutMs?: number;
	notes: string;
}

const DEPTH_HDR_CASES: DepthHdrCase[] = [
	{
		id: "h264_8bit_to_hevc_10bit",
		asset: "micro_h264_1frame.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		toContainer: "mp4",
		toVideo: "hevc",
		feature: "depth:10bit-output",
		extraOpts: {
			video: { codec: "hevc", bitDepth: 10 },
			invariant: "transcode-effect-aware",
		},
		oracles: ["ssim-psnr", "property-invariant", "playback-smoke"],
		notes:
			"8-bit→10-bit HEVC encode (A.5/A.4 8↔10-bit). Uses the browser-baked 320×240 one-frame H.264 " +
			"fixture for future coverage, but remains N/A until an engine can emit HEVC-10 inside suite budgets.",
	},
	{
		id: "h264_10bit_to_h264_8bit",
		asset: "h264_10bit_1080p_5s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		toContainer: "mp4",
		toVideo: "h264",
		feature: "depth:10bit-to-8bit",
		extraOpts: {
			video: { codec: "h264", bitDepth: 8 },
			invariant: "transcode-effect-aware",
		},
		oracles: ["ssim-psnr", "property-invariant", "playback-smoke"],
		notes:
			"10-bit→8-bit down-convert (A.4). Uses the corpus 10-bit H.264 fixture and encodes an 8-bit " +
			"H.264 output, so the row tests the actual available 10-bit source instead of a mislabeled HEVC fixture.",
	},
	{
		id: "hdr10_to_sdr_tonemap",
		asset: "hdr10_pq_micro_hevc.mp4",
		fromContainer: "mp4",
		fromVideo: "hevc",
		toContainer: "mp4",
		toVideo: "h264",
		feature: "tonemap",
		extraOpts: {
			video: { codec: "h264" },
			tonemap: { from: "pq", to: "sdr" },
			invariant: "transcode-effect-aware",
		},
		oracles: ["property-invariant", "playback-smoke"],
		notes:
			"HDR10→SDR tone-map uses a real BT.2020/PQ source and requires transformed luminance/color " +
			"pixels plus BT.709 transfer/primaries/matrix/range signaling. A codec-only no-op fails.",
	},
];

const depthHdrScenarios: Scenario[] = DEPTH_HDR_CASES.map((c) =>
	defineScenario({
		id: `transcode/${c.id}`,
		op: "transcode",
		input: c.asset,
		options: { container: c.toContainer, ...(c.extraOpts ?? {}) },
		requires: {
			operations: ["transcode"],
			containersIn: [c.fromContainer],
			containersOut: [c.toContainer],
			videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
			features: [c.feature],
		},
		oracles: c.oracles ?? ["ssim-psnr", "playback-smoke"],
		metrics: [...TC_METRICS],
		tolerances: c.tolerances ?? { ssimMin: 0.97 },
		...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
		notes: c.notes,
	}),
);

// ── A.8 — alpha-preservation transcode (re-encode alpha-bearing VP9, keep the alpha plane) ────────
//
// vp9_alpha.webm carries a VP9 alpha plane; these re-encode it and attach the dedicated `alpha-plane`
// oracle so the alpha channel is validated separately (not just the colour planes). Preserving alpha
// through encode is stricter than generic alpha decode/raster support, so these require the specific
// undeclared 'alpha:transcode' feature and honestly negotiate NA_ENGINE until an adapter implements it.
const ALPHA_CASES: VideoTranscodeCase[] = [
	{
		id: "vp9_alpha_to_vp9_keepalpha",
		revision: 3,
		asset: "vp9_alpha.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		toContainer: "webm",
		toVideo: "vp9",
		features: ["alpha", "alpha:transcode", "resize"],
		candidateEnvelope: {
			excludeDimensions: [{ width: 320, height: 240 }],
		},
		opts: {
			container: "webm",
			video: { codec: "vp9", width: 320, height: 240 },
			alpha: "keep",
			invariant: "transcode-effect-aware",
		},
		oraclesOverride: ["alpha-plane", "property-invariant", "playback-smoke"],
		notes:
			'VP9→VP9 re-encode with resize, alpha PRESERVED (alpha:"keep"). alpha-plane oracle validates the ' +
			"alpha channel. SSIM is omitted because colour-plane drift on this tiny alpha-side-data clip is " +
			"not the property under test. The effect oracle independently grades resized alpha samples and " +
			"authored AlphaMode; NA_BROWSER still applies when generic alpha is unsupported.",
	},
	{
		id: "vp9_alpha_to_vp8_keepalpha",
		revision: 2,
		asset: "vp9_alpha.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		toContainer: "webm",
		toVideo: "vp8",
		features: ["alpha", "alpha:transcode"],
		opts: {
			container: "webm",
			video: { codec: "vp8" },
			alpha: "keep",
			invariant: "transcode-effect-aware",
		},
		oraclesOverride: ["alpha-plane", "property-invariant", "playback-smoke"],
		notes:
			"VP9-alpha→VP8 alpha round-trip (VP8 also supports a YUVA alpha plane in WebM). alpha-plane oracle " +
			"gates once alpha-preserving transcode is explicitly implemented; SSIM omitted (cross-codec colour " +
			"drift on a tiny alpha clip is not the property under test).",
	},
];

const alphaScenarios: Scenario[] = ALPHA_CASES.map(buildVideoScenario);

// ── A.16 — B-frame / open-GOP source re-encode (presentation-order reorder correctness) ───────────
const bframeScenarios: Scenario[] = [
	buildVideoScenario({
		id: "bframe_reorder_h264_to_h264",
		asset: "h264_bframes_1080p.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		opts: { container: "mp4", video: { codec: "h264" } },
		tolerances: { ssimMin: 0.98 },
		notes:
			"Re-encode an open-GOP / B-frame source (pts≠dts reorder, A.16). ssim-psnr in presentation order " +
			"catches an engine that mishandles the decode reorder (frames would land out of order → low SSIM).",
	}),
	buildVideoScenario({
		id: "bframe_reorder_h264_to_vp9",
		asset: "h264_bframes_1080p.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp9",
		toAudio: "opus",
		opts: {
			container: "webm",
			video: { codec: "vp9" },
			audio: { codec: "opus" },
		},
		tolerances: { ssimMin: 0.97 },
		notes:
			"B-frame/open-GOP H.264 → VP9: reorder correctness across a codec change.",
	}),
];

// ── A.16 — multi-track input transcode (track selection / passthrough during re-encode) ───────────
const multitrackScenarios: Scenario[] = [
	buildVideoScenario({
		id: "multitrack_select_default_audio",
		asset: "h264_multitrack.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		opts: {
			container: "mp4",
			video: { codec: "h264" },
			audio: { codec: "aac" },
		},
		tolerances: {
			ssimMin: 0.98,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes:
			"Re-encode a 2-audio-track MP4 (A.16 multi-track). Video gated by ssim-psnr; output metadata " +
			"asserts the produced container/codecs because transcode does not populate ctx.metadata.",
		extraOracles: ["property-invariant"],
		optsInvariant: "transcode-output-metadata",
	}),
];

// ── A.6 — audio ENCODE matrix gaps (lossy-to-lossy & lossless-to-lossy the base set omits) ────────
//
// Lossy targets (AAC/Opus/MP3/Vorbis) use decoded error/SNR/channel-correlation contracts rather than
// bit-exactness. AAC edit-list timing and Opus Ogg/WebM delay+trim evidence select the exact program
// interval; fixed duration allowances are not used. playback-smoke remains browser-container-only.
interface AudioEncodeCase {
	id: string;
	revision?: number;
	asset: string;
	fromContainer: string;
	fromAudio: string;
	toContainer: string;
	toAudio: string;
	opts: TranscodeOptions;
	candidateEnvelope?: CandidateInputEnvelope;
	/** true only for lossless targets (strict duration is legitimate) */
	lossless?: boolean;
	notes?: string;
}

const AUDIO_ENCODE_CASES: AudioEncodeCase[] = [
	{
		id: "aac_to_mp3_mp4",
		asset: "aac_adts.aac",
		fromContainer: "adts",
		fromAudio: "aac",
		toContainer: "mp4",
		toAudio: "mp3",
		opts: { container: "mp4", audio: { codec: "mp3", bitrate: 192_000 } },
		notes:
			"AAC→MP3 (A.6 gap). Lossy→lossy decoded content is gated by the documented error contract.",
	},
	{
		id: "opus_to_aac_mp4",
		asset: "opus.ogg",
		fromContainer: "ogg",
		fromAudio: "opus",
		toContainer: "mp4",
		toAudio: "aac",
		opts: { container: "mp4", audio: { codec: "aac", bitrate: 192_000 } },
		notes:
			"Opus→AAC (A.6 gap). AAC priming/remainder is taken from authored ISO-BMFF timing.",
	},
	{
		id: "flac_to_opus_webm",
		asset: "flac_seektable.flac",
		fromContainer: "flac",
		fromAudio: "flac",
		toContainer: "webm",
		toAudio: "opus",
		opts: { container: "webm", audio: { codec: "opus", bitrate: 128_000 } },
		notes:
			"FLAC(lossless)→Opus(lossy) (A.6 gap). WebM CodecDelay/DiscardPadding selects the program interval.",
	},
	{
		id: "mp3_to_opus_webm",
		asset: "mp3_xing.mp3",
		fromContainer: "mp3",
		fromAudio: "mp3",
		toContainer: "webm",
		toAudio: "opus",
		opts: { container: "webm", audio: { codec: "opus", bitrate: 128_000 } },
		notes: "MP3→Opus (A.6, exercises MP3 as a source beyond mp3→aac).",
	},
	{
		id: "wav_to_mp3_mp4",
		asset: "wav_s16.wav",
		fromContainer: "wav",
		fromAudio: "pcm-s16",
		toContainer: "mp4",
		toAudio: "mp3",
		opts: { container: "mp4", audio: { codec: "mp3", bitrate: 192_000 } },
		notes: "PCM→MP3 (A.6, MP3 as an encode target from WAV).",
	},
	{
		id: "wav_to_vorbis_ogg",
		asset: "wav_s16.wav",
		fromContainer: "wav",
		fromAudio: "pcm-s16",
		toContainer: "ogg",
		toAudio: "vorbis",
		opts: { container: "ogg", audio: { codec: "vorbis", bitrate: 128_000 } },
		notes:
			"PCM→Vorbis in OGG (A.6: Vorbis as an encode target outside the h264→vp8 video case).",
	},
	{
		id: "aac_to_pcm_wav_extract",
		revision: 2,
		asset: "aac_adts.aac",
		fromContainer: "adts",
		fromAudio: "aac",
		toContainer: "wav",
		toAudio: "pcm-s16",
		opts: { container: "wav", audio: { codec: "pcm-s16" } },
		candidateEnvelope: { minAudioMeanVolumeDb: -80 },
		lossless: true,
		notes:
			"AAC→PCM(WAV) extract (A.7/A.6 PCM-as-target). WAV structure and decoded sample preservation gate.",
	},
];

const audioEncodeScenarios: Scenario[] = AUDIO_ENCODE_CASES.map((c) => {
	const browserPlayable = c.toContainer === "mp4" || c.toContainer === "webm";
	const oracles: OracleId[] = ["property-invariant"];
	if (browserPlayable) oracles.push("playback-smoke");
	return defineScenario({
		id: `transcode/${c.id}`,
		...(c.revision ? { revision: c.revision } : {}),
		op: "transcode",
		input: c.asset,
		...(c.candidateEnvelope ? { candidateEnvelope: c.candidateEnvelope } : {}),
		options: withAudioContentInvariant(c.opts),
		requires: {
			operations: ["transcode"],
			containersIn: [c.fromContainer],
			containersOut: [c.toContainer],
			audioCodecs: [...new Set([c.fromAudio, c.toAudio])],
		},
		oracles,
		metrics: ["wall", "throughputRealtime", "peakMemory", "longtasks"],
		...(c.notes ? { notes: c.notes } : {}),
	});
});

// ── §5.3 — size-ladder throughput (transcode-throughput-vs-size; perf cases, primaryMetric set) ───
//
// Spec 5.3: "Size is a first-class test axis ... benchmark across the full ladder." The base transcode
// cases all use the medium workhorse; these transcode the tiny / large rungs of BOTH major families so
// a throughput-vs-size curve exists. primaryMetric='framesPerSec' (higher-is-better, §9). Correctness
// still gates the number (ssim-psnr). Large rungs carry a generous timeout; their fixtures are
// large-bucket (may be deferred in a --subset bake → SKIPPED, never a fake number).
interface SizeLadderCase {
	id: string;
	revision?: number;
	asset: string;
	candidateEnvelope?: CandidateInputEnvelope;
	fromContainer: string;
	fromVideo: string;
	fromAudio: string;
	toContainer: string;
	toVideo: string;
	toAudio?: string;
	width: number;
	height: number;
	tolerances?: OracleTolerances;
	timeoutMs?: number;
	notes: string;
}

const SIZE_LADDER_CASES: SizeLadderCase[] = [
	{
		id: "ladder_tiny_h264_360p_resize_180p",
		asset: "tiny_h264_360p_2s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		width: 320,
		height: 180,
		tolerances: { ssimMin: 0.95 },
		notes:
			"TINY rung (~100 KB) transcode+resize → frames/sec. Init-overhead-dominated end of the curve.",
	},
	{
		id: "ladder_tiny_vp9_360p_to_h264_180p",
		asset: "tiny_vp9_360p_2s.webm",
		fromContainer: "webm",
		fromVideo: "vp9",
		fromAudio: "opus",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		width: 320,
		height: 180,
		notes:
			"TINY WebM/VP9 rung → H.264; crosses the size axis with the container/codec axis.",
	},
	{
		id: "ladder_large_h264_1080p_120s_resize_720p",
		revision: 2,
		asset: "large_h264_1080p_120s.mp4",
		candidateEnvelope: LARGE_1080P_120S_CANDIDATE_ENVELOPE,
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		width: 1280,
		height: 720,
		timeoutMs: 600_000,
		notes:
			"LARGE rung (~100 MB, 120s) transcode+resize → steady-state frames/sec at scale. Fixture may be " +
			"deferred by a subset bake → SKIPPED (never a fabricated number).",
	},
	{
		id: "ladder_large_vp9_1080p_120s_to_h264_720p",
		revision: 2,
		asset: "large_vp9_1080p_120s.webm",
		candidateEnvelope: LARGE_1080P_120S_CANDIDATE_ENVELOPE,
		fromContainer: "webm",
		fromVideo: "vp9",
		fromAudio: "opus",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		width: 1280,
		height: 720,
		timeoutMs: 600_000,
		notes:
			"LARGE WebM/VP9 rung → H.264 at scale; pairs with the H.264 large rung for the curve.",
	},
];

const sizeLadderScenarios: Scenario[] = SIZE_LADDER_CASES.map((c) =>
	defineScenario({
		id: `transcode/${c.id}`,
		...(c.revision !== undefined ? { revision: c.revision } : {}),
		op: "transcode",
		input: c.asset,
		...(c.candidateEnvelope ? { candidateEnvelope: c.candidateEnvelope } : {}),
		options: {
			container: c.toContainer,
			video: { codec: c.toVideo, width: c.width, height: c.height },
			...(c.toAudio ? { audio: { codec: c.toAudio } } : {}),
		},
		requires: {
			operations: ["transcode"],
			containersIn: [c.fromContainer],
			containersOut: [c.toContainer],
			videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
			audioCodecs: [
				...new Set([c.fromAudio, c.toAudio].filter((x): x is string => !!x)),
			],
			features: ["resize"],
		},
		oracles: ["ssim-psnr"],
		metrics: ["framesPerSec", "wall", "peakMemory"],
		primaryMetric: "framesPerSec",
		tolerances: c.tolerances ?? { ssimMin: 0.97 },
		...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
		notes: c.notes,
	}),
);

// ── A.3 — container WRITE breadth for transcode targets (MOV / MKV / TS / fragmented-mp4) ──────────
//
// The base set only writes mp4/webm/ogg/flac. These re-encode H.264 into the other muxable containers
// so the WRITE side of the container matrix is exercised by transcode. fragmented-mp4 (CMAF) tags the
// declared 'fragmented' feature. Output metadata gates the produced container/codec/duration; packet
// count/keyframe equality is deliberately NOT used because re-encode outputs are allowed to choose a
// different GOP and packetization from the source.
interface ContainerWriteCase {
	id: string;
	toContainer: string;
	feature?: string;
	tolerances?: OracleTolerances;
	browserPlayable: boolean;
	notes: string;
}

const CONTAINER_WRITE_CASES: ContainerWriteCase[] = [
	{
		id: "h264_to_mov",
		toContainer: "mov",
		browserPlayable: false,
		notes:
			"Transcode → MOV (A.3 write breadth). Output metadata gates structure; SSIM gates pixels.",
	},
	{
		id: "h264_to_mkv",
		toContainer: "mkv",
		browserPlayable: false,
		notes:
			"Transcode → Matroska (A.3). MKV is not reliably <video>-playable → no playback-smoke.",
	},
	{
		id: "h264_to_ts",
		toContainer: "ts",
		browserPlayable: false,
		notes:
			"Transcode → MPEG-TS (A.3). Annex-B/ADTS write path; output metadata gates structure. Browser " +
			"SSIM decode is omitted because raw TS is not reliably decodable through <video> bytes.",
	},
	{
		id: "h264_to_fragmented_mp4",
		toContainer: "mp4",
		feature: "fragmented",
		tolerances: {
			ssimMin: 0.96,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		browserPlayable: true,
		notes:
			'Transcode → fragmented MP4 / CMAF (A.3, fastStart:"fragmented"). Requires the declared ' +
			'"fragmented" feature; raw fMP4 bytes are validated by SSIM plus output metadata rather than ' +
			"playback-smoke because MSE-style fragments are not reliably playable as a standalone <video> src.",
	},
];

const containerWriteScenarios: Scenario[] = CONTAINER_WRITE_CASES.map((c) => {
	const oracles: OracleId[] =
		c.toContainer === "ts"
			? ["property-invariant"]
			: ["ssim-psnr", "property-invariant"];
	if (c.browserPlayable && c.feature !== "fragmented")
		oracles.push("playback-smoke");
	return defineScenario({
		id: `transcode/${c.id}`,
		op: "transcode",
		input: "h264_1080p_30s.mp4",
		options: withOutputMetadataInvariant({
			container: c.toContainer,
			video: { codec: "h264" },
			...(c.feature === "fragmented" ? { fastStart: "fragmented" } : {}),
		}),
		requires: {
			operations: ["transcode"],
			containersIn: ["mp4"],
			containersOut: [c.toContainer],
			videoCodecs: ["h264"],
			audioCodecs: ["aac"],
			...(c.feature ? { features: [c.feature] } : {}),
		},
		oracles,
		metrics: [...TC_METRICS],
		tolerances: c.tolerances ?? {
			ssimMin: 0.98,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes: c.notes,
	});
});

// ── A.16 — metamorphic / property invariants on transcode outputs (§11) ───────────────────────────
//
// All of these drive op:'transcode' so the runner produces ctx.output, and select an invariant the
// property-invariant oracle ACTUALLY interprets ('transcode-output-metadata' for output
// container/codec/duration, or 'probe-duration' where only duration is under test). 'decode-remux'
// (bit-exact frame digests) is deliberately NOT used: a lossy re-encode never reproduces the source
// digests, so it would guarantee a FAIL. Pixel stability (idempotence, round-trip generational loss)
// is therefore expressed via ssim-psnr where the reference path is sound.
interface TranscodePropertyCase {
	id: string;
	asset: string;
	fromContainer: string;
	fromVideo: string;
	fromAudio?: string;
	toContainer: string;
	toVideo: string;
	features?: string[];
	opts: TranscodeOpts;
	oracles: OracleId[];
	tolerances?: OracleTolerances;
	notes: string;
}

const TRANSCODE_PROPERTY_CASES: TranscodePropertyCase[] = [
	{
		// Idempotent-in-dimensions: resize 1080p→1080p (SAME size) should be ~no-op-ish. SSIM is the GATE
		// here and the no-golden reference path is sound (same dims, index-paired, presentation order):
		// a correct ~no-op scores very high SSIM; dims are asserted to be unchanged by the resize option.
		id: "metamorphic_resize_same_1080p_idempotent",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["resize"],
		opts: {
			container: "mp4",
			video: { codec: "h264", width: 1920, height: 1080 },
			invariant: "transcode-output-metadata",
		},
		oracles: ["ssim-psnr", "property-invariant"],
		tolerances: {
			ssimMin: 0.97,
			durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC,
		},
		notes:
			"Metamorphic idempotent-in-dimensions (A.16): resize 1080p→1080p is ~no-op. ssim-psnr (same-dims " +
			"reference path is sound) gates high similarity; output metadata confirms unchanged dimensions, " +
			"codec/container, and duration. A wrong-dims engine diverges on both.",
	},
	{
		// Duration preserved through a CROSS-CODEC re-encode (probe(transcode(x)).dur ≈ probe(x).dur).
		id: "metamorphic_duration_preserved_h264_to_vp9",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp9",
		opts: {
			container: "webm",
			video: { codec: "vp9" },
			audio: { codec: "opus" },
			invariant: "probe-duration",
		},
		oracles: ["property-invariant"],
		notes:
			"Metamorphic: probe(transcode(x)).dur ≈ probe(x).dur across a codec change (property-invariant " +
			"probe-duration). Catches an engine that drops/duplicates frames or mis-writes the duration.",
	},
];

const transcodePropertyScenarios: Scenario[] = TRANSCODE_PROPERTY_CASES.map(
	(c) =>
		defineScenario({
			id: `transcode/${c.id}`,
			op: "transcode",
			input: c.asset,
			options: c.opts,
			requires: {
				operations: ["transcode"],
				containersIn: [c.fromContainer],
				containersOut: [c.toContainer],
				videoCodecs: [...new Set([c.fromVideo, c.toVideo])],
				...(c.fromAudio ? { audioCodecs: [c.fromAudio] } : {}),
				...(c.features ? { features: c.features } : {}),
			},
			oracles: c.oracles,
			metrics: [...TC_METRICS],
			...(c.tolerances ? { tolerances: c.tolerances } : {}),
			notes: c.notes,
		}),
);

// ── A.16 — double-transcode round-trip A→B→A (generational-loss bound) ────────────────────────────
//
// Two-leg metamorphic: H.264 → VP9 → H.264. The composition binding passes leg one's exact bytes to
// leg two and retains the immutable original as the final quality reference. Digests at both adapter
// boundaries prove the chain; leg one also remains independently scoreable.
const roundTripScenarios: Scenario[] = [
	buildVideoScenario({
		id: "roundtrip_leg1_h264_to_vp9",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "webm",
		toVideo: "vp9",
		toAudio: "opus",
		opts: {
			container: "webm",
			video: { codec: "vp9" },
			audio: { codec: "opus" },
		},
		tolerances: { ssimMin: 0.97 },
		notes:
			"Round-trip leg 1/2 (A.16 double-transcode): H.264→VP9. SSIM gates leg-1 fidelity.",
	}),
	buildVideoScenario({
		id: "roundtrip_leg2_vp9_to_h264",
		// This is the composed A->B->A cell. The runner begins from the immutable original and obtains
		// the VP9/Opus input to leg two exclusively from leg one's exact output binding.
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		toAudio: "aac",
		opts: {
			container: "mp4",
			video: { codec: "h264" },
			audio: { codec: "aac" },
			invariant: "transcode-roundtrip-composed",
		},
		extraOracles: ["property-invariant"],
		// Generational-loss floor: looser than a single encode to absorb two lossy generations.
		tolerances: { ssimMin: 0.95 },
		notes:
			"Round-trip leg 2/2 consumes leg one through an exact-byte output binding. Provenance proves " +
			"the bound digest and the final perceptual comparison retains the immutable original source.",
	}),
];

// ── A.16 — extreme targets: 1 fps / 240 fps, 0×0 / 1×1 resize (handle gracefully or correctly) ────
//
// Extreme fps is gated by duration-preservation (property-invariant probe-duration; an interpolating/
// decimating extreme rate makes index-paired SSIM unsound). Degenerate 0×0 / 1×1 resize MUST be
// handled gracefully via the graceful-failure oracle; an engine that instead emits a sane 1×1 frame
// also passes via the output path only if it does not crash. 0×0 is the harder degenerate (no valid
// frame) and is expected to throw cleanly.
const extremeFpsScenarios: Scenario[] = [
	buildVideoScenario({
		id: "extreme_fps_1",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["fps"],
		opts: {
			container: "mp4",
			video: { codec: "h264", fps: 1 },
			invariant: "probe-duration",
		},
		oraclesOverride: ["property-invariant", "playback-smoke"],
		tolerances: { durationToleranceSec: TC_ONE_FPS_DURATION_TOLERANCE_SEC },
		notes:
			"Extreme fps 1 (A.16). Heavy decimation; duration may quantize by one whole output frame, " +
			"and index SSIM is unsound.",
	}),
	buildVideoScenario({
		id: "extreme_fps_240",
		asset: "h264_1080p_30s.mp4",
		fromContainer: "mp4",
		fromVideo: "h264",
		fromAudio: "aac",
		toContainer: "mp4",
		toVideo: "h264",
		features: ["fps"],
		opts: {
			container: "mp4",
			video: { codec: "h264", fps: 240 },
			invariant: "probe-duration",
		},
		oraclesOverride: ["property-invariant", "playback-smoke"],
		tolerances: { durationToleranceSec: TC_REENCODE_DURATION_TOLERANCE_SEC },
		notes:
			"Extreme fps 240 (A.16). Heavy interpolation; gated by duration-preservation.",
	}),
];

const extremeResizeScenarios: Scenario[] = [
	defineScenario({
		id: "transcode/extreme_resize_1x1",
		revision: 2,
		op: "transcode",
		input: "h264_1080p_30s.mp4",
		options: {
			container: "mp4",
			video: { codec: "h264", width: 1, height: 1 },
			gracefulAllowOutput: true,
			robustness: defineRobustnessContract(
				"boundary",
				"media-structure",
				["graceful-failure"],
				TC_EDGE_TIMEOUT_MS,
			),
		},
		requires: {
			operations: ["transcode"],
			containersIn: ["mp4"],
			containersOut: ["mp4"],
			videoCodecs: ["h264"],
			audioCodecs: ["aac"],
			features: ["resize"],
		},
		oracles: ["graceful-failure"],
		metrics: ["wall"],
		timeoutMs: TC_EDGE_TIMEOUT_MS,
		// 1x1 is valid-but-degenerate, so returned output is also an accepted non-crash path.
		notes:
			'1×1 resize (A.16 "0×0 or 1×1 video"). Must handle gracefully or correctly — a clean throw or a ' +
			"sane minimal frame, never a crash/hang/OOM. graceful-failure allows returned output for this " +
			"valid-but-degenerate target via the robustness path.",
	}),
	defineScenario({
		id: "transcode/extreme_resize_0x0",
		revision: 2,
		op: "transcode",
		input: "h264_1080p_30s.mp4",
		options: {
			container: "mp4",
			video: { codec: "h264", width: 0, height: 0 },
			robustness: defineRobustnessContract(
				"negative",
				"media-structure",
				["graceful-failure"],
				TC_EDGE_TIMEOUT_MS,
			),
		},
		requires: {
			operations: ["transcode"],
			containersIn: ["mp4"],
			containersOut: ["mp4"],
			videoCodecs: ["h264"],
			audioCodecs: ["aac"],
			features: ["resize"],
		},
		oracles: ["graceful-failure"],
		metrics: ["wall"],
		timeoutMs: TC_EDGE_TIMEOUT_MS,
		notes:
			"0×0 resize (A.16 degenerate dimensions). Expected to throw cleanly (no valid frame); " +
			"graceful-failure via the robustness path — output for 0×0 input is suspicious → FAIL.",
	}),
];

// ── A.16 / §5.1 / §7 — negative & malformed inputs to transcode (must NA/throw, never crash) ──────
//
// (1) Image negatives: a still image fed to a VIDEO transcode. These deliberately do NOT require a
//     jpeg/png/webp pseudo-container: the point is not image decode support, it is that engines with a
//     transcode path reject invalid input cleanly through the graceful-failure oracle.
// (2) Truncated / zero-length sources: real malformed files so graceful-failure is sound
//     (throw=PASS, output=FAIL).
// (3) audio-only→video and video-only→audio mismatches: valid input, impossible target. A clean throw
//     passes; an engine that silently emits a degenerate file is flagged (output=FAIL) for review.
interface TranscodeNegativeCase {
	id: string;
	asset: string;
	/** declared input container(s); omit for invalid-image rows so graceful-failure can exercise them */
	containersIn?: string[];
	videoCodecs?: string[];
	audioCodecs?: string[];
	options: Record<string, unknown>;
	notes: string;
}

const NEGATIVE_CASES: TranscodeNegativeCase[] = [
	{
		id: "negative_jpeg_to_video",
		asset: "image.jpg",
		options: { container: "mp4", video: { codec: "h264" } },
		notes:
			"JPEG → video transcode (§5.1/§7/A.16 image negative). Engines with transcode support must reject the still image cleanly.",
	},
	{
		id: "negative_png_to_video",
		asset: "image.png",
		options: { container: "mp4", video: { codec: "h264" } },
		notes:
			"PNG → video transcode negative. Engines with transcode support must reject the still image cleanly.",
	},
	{
		id: "negative_webp_to_video",
		asset: "image.webp",
		options: { container: "mp4", video: { codec: "h264" } },
		notes:
			"WebP (still image) → video transcode negative. Engines with transcode support must reject the still image cleanly.",
	},
	{
		id: "malformed_truncated_h264_transcode",
		asset: "transcode_truncated_h264_60p.mp4",
		containersIn: ["mp4"],
		videoCodecs: ["h264"],
		audioCodecs: ["aac"],
		options: {
			container: "mp4",
			video: { codec: "h264" },
			gracefulAllowOutput: true,
		},
		notes:
			"Truncated H.264 (moov/mdat incomplete) → transcode (A.16 header-truncated, §5.1). Robustness path: " +
			"must throw/reject within the timeout — no crash/hang/OOM. Uses a deterministic 60%-truncated fixture.",
	},
	{
		id: "malformed_zero_length_transcode",
		asset: "zero_length.mp4",
		containersIn: ["mp4"],
		videoCodecs: ["h264"],
		audioCodecs: ["aac"],
		options: { container: "mp4", video: { codec: "h264" } },
		notes:
			"Zero-length file → transcode (A.16 zero-length). Robustness path: clean throw expected, no crash. " +
			"Complements the robustness family with a transcode-specific degenerate-input entry.",
	},
	{
		id: "mismatch_audio_only_to_video_target",
		asset: "wav_s16.wav",
		containersIn: ["wav"],
		videoCodecs: ["h264"],
		options: { container: "mp4", video: { codec: "h264" } },
		notes:
			'Audio-only input → VIDEO-targeting transcode (A.16 "audio-only/video-only"). Expect a clean throw ' +
			"(no video track to encode). Robustness path: throw=PASS; silently emitting a degenerate file=FAIL.",
	},
	{
		id: "mismatch_video_only_to_audio_target",
		asset: "micro_h264_1frame.mp4",
		containersIn: ["mp4"],
		videoCodecs: ["h264"],
		audioCodecs: ["aac"],
		options: { container: "mp4", audio: { codec: "aac" } },
		notes:
			"Video-only input (no audio track) → AUDIO-targeting transcode (A.16). Expect a clean throw (no " +
			"audio to encode). Robustness path: throw=PASS.",
	},
	{
		id: "mismatch_mislabeled_container_transcode",
		asset: "h264_ts.ts",
		containersIn: ["mp4"], // deliberately mislabel a TS payload as MP4 input
		videoCodecs: ["h264"],
		audioCodecs: ["aac"],
		options: {
			container: "mp4",
			video: { codec: "h264" },
			gracefulAllowOutput: true,
		},
		notes:
			'Mislabeled container: a TS payload declared as mp4 input (A.16 "h264 mislabeled / mismatched ' +
			'container/codec"). Robustness path: the engine must detect the mismatch and fail gracefully (or ' +
			"correctly transcode if it sniffs the real format) — never crash.",
	},
];

const negativeScenarios: Scenario[] = NEGATIVE_CASES.map((c) =>
	defineScenario({
		id: `transcode/${c.id}`,
		revision: 2,
		op: "transcode",
		input: c.asset,
		options: {
			...c.options,
			robustness: defineRobustnessContract(
				c.options.gracefulAllowOutput === true ? "boundary" : "negative",
				"media-structure",
				["graceful-failure"],
				TC_EDGE_TIMEOUT_MS,
			),
		},
		requires: {
			operations: ["transcode"],
			...(c.containersIn ? { containersIn: c.containersIn } : {}),
			...(c.videoCodecs ? { videoCodecs: c.videoCodecs } : {}),
			...(c.audioCodecs ? { audioCodecs: c.audioCodecs } : {}),
		},
		oracles: ["graceful-failure"],
		metrics: ["wall"],
		timeoutMs: TC_EDGE_TIMEOUT_MS,
		notes: c.notes,
	}),
);

// ── A.16 — gapless audio (encoder delay/padding) round-trip through AAC/Opus ──────────────────────
//
// AAC/Opus add priming and trailing padding. These rows use authored edit-list or granule evidence to
// isolate the exact presentation interval; legitimate delay passes and undeclared excess/loss fails.
const gaplessScenarios: Scenario[] = [
	defineScenario({
		id: "transcode/gapless_pcm_to_aac_priming",
		op: "transcode",
		input: "wav_s16.wav",
		options: withAudioContentInvariant({
			container: "mp4",
			audio: { codec: "aac", bitrate: 192_000 },
		}),
		requires: {
			operations: ["transcode"],
			containersIn: ["wav"],
			containersOut: ["mp4"],
			audioCodecs: ["pcm-s16", "aac"],
		},
		oracles: ["property-invariant", "playback-smoke"],
		metrics: ["wall", "peakMemory", "longtasks"],
		notes:
			"Gapless AAC encode: decoded content is compared only over the edit-list presentation interval; " +
			"explicit AAC priming and remainder samples are modeled and any undeclared excess/loss fails.",
	}),
	defineScenario({
		id: "transcode/gapless_pcm_to_opus_priming",
		op: "transcode",
		input: "wav_s16.wav",
		options: withAudioContentInvariant({
			container: "ogg",
			audio: { codec: "opus", bitrate: 128_000 },
		}),
		requires: {
			operations: ["transcode"],
			containersIn: ["wav"],
			containersOut: ["ogg"],
			audioCodecs: ["pcm-s16", "opus"],
		},
		oracles: ["property-invariant"],
		metrics: ["wall", "peakMemory", "longtasks"],
		notes:
			"Gapless Ogg Opus encode: OpusHead pre-skip and the final granule position define the exact " +
			"program interval and end trimming; no fixed-delay estimate is accepted.",
	}),
];

// ── A.16 — variable / unusual channel count on a MUXED A/V transcode (beyond audio-dsp downmix) ────
//
// audio-dsp covers stereo↔mono on audio-only WAV; this exercises a channel-layout change DURING a
// video+audio re-encode (the muxed path). The audio-content invariant scores decoded mono against the
// declared stereo average after AAC timing trim, while ssim-psnr gates video. A true muxed A/V 5.1
// source is still not in the corpus; the audio-only 5.1 WAV is covered by audio-dsp.
const channelScenarios: Scenario[] = [
	defineScenario({
		id: "transcode/av_downmix_stereo_to_mono",
		revision: 2,
		op: "transcode",
		input: "h264_1080p_30s.mp4",
		candidateEnvelope: { minAudioMeanVolumeDb: -80 },
		options: withAudioContentInvariant({
			container: "mp4",
			video: { codec: "h264" },
			audio: { codec: "aac", channels: 1 },
		}),
		requires: {
			operations: ["transcode"],
			containersIn: ["mp4"],
			containersOut: ["mp4"],
			videoCodecs: ["h264"],
			audioCodecs: ["aac"],
		},
		oracles: ["ssim-psnr", "property-invariant"],
		metrics: [...TC_METRICS],
		tolerances: { ssimMin: 0.98 },
		notes:
			"Channel-layout change on a MUXED A/V transcode (A.16 variable channel count): stereo→mono during " +
			"video+audio re-encode. Decoded mono content is compared to the declared stereo average after " +
			"AAC edit-list trimming; ssim-psnr gates the video. " +
			"(A muxed A/V 5.1 source is still a corpus gap; audio-only 5.1 is covered by audio-dsp.)",
	}),
];

// ── DoD §13 — self-consistency: a transcode case in the register-twice set (must tie within noise) ──
//
// The same engine registered twice must produce statistically-tied perf on this case. It is a plain,
// fast, deterministic transcode (medium asset, resize→720p) with a perf primaryMetric so the
// register-twice self-check has a transcode representative (DoD 13). Correctness still gates the number.
const selfConsistencyScenarios: Scenario[] = [
	defineScenario({
		id: "transcode/selfcheck_h264_resize_720p_tie",
		op: "transcode",
		input: "h264_1080p_30s.mp4",
		options: {
			container: "mp4",
			video: { codec: "h264", width: 1280, height: 720 },
		},
		requires: {
			operations: ["transcode"],
			containersIn: ["mp4"],
			containersOut: ["mp4"],
			videoCodecs: ["h264"],
			audioCodecs: ["aac"],
			features: ["resize"],
		},
		oracles: ["ssim-psnr"],
		metrics: ["framesPerSec", "wall"],
		primaryMetric: "framesPerSec",
		tolerances: { ssimMin: 0.98 },
		notes:
			"Self-consistency representative (DoD §13): the same engine registered twice must tie within noise " +
			"on this transcode (frames/sec). Deterministic resize→720p; correctness (ssim-psnr) gates the number.",
	}),
];

export const transcodeScenarios: Scenario[] = [
	...videoScenarios,
	...audioScenarios,
	...fanoutScenarios,
	// extended coverage
	...crossCodecScenarios,
	...fpsUpScenarios,
	...rotateScenarios,
	...transformFeatureScenarios,
	...depthHdrScenarios,
	...alphaScenarios,
	...bframeScenarios,
	...multitrackScenarios,
	...audioEncodeScenarios,
	...sizeLadderScenarios,
	...containerWriteScenarios,
	...transcodePropertyScenarios,
	...roundTripScenarios,
	...extremeFpsScenarios,
	...extremeResizeScenarios,
	...negativeScenarios,
	...gaplessScenarios,
	...channelScenarios,
	...selfConsistencyScenarios,
];

export default transcodeScenarios;
