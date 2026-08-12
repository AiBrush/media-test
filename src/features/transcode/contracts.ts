import type { OracleId } from "../../core/scenario.ts";
import {
	type AbrSwitchingContract,
	type AverageVideoBitrateContract,
	defineAbrSwitchingContract,
	defineAverageVideoBitrateContract,
} from "./abr.ts";
import type { TranscodeAudioContentContract } from "./audio.ts";
import {
	type TranscodeRoundTripContract,
	defineTranscodeRoundTripContract,
} from "./composition.ts";
import {
	type TranscodeMetricAdmissionContract,
	defineTranscodeMetricAdmissionContract,
} from "./metrics.ts";
import {
	type TranscodeTransformContract,
	type TransformPixelTolerance,
	defineTranscodeTransformContract,
} from "./transforms.ts";

const GEOMETRY_TOLERANCE: TransformPixelTolerance = {
	meanAbsoluteError: 0.08,
	maxAbsoluteError: 0.55,
	// Lossy YUV↔RGB↔YUV round trips can create extreme edge/chroma samples. A global maximum over
	// tens of millions of channels is statistically degenerate, so require the 99th percentile plus
	// the much tighter mean and independent SSIM/effect gates instead.
	maxOutlierFraction: 0.01,
	maxAlphaError: 0.02,
	minimumObservableEffect: 0.01,
};

const COLOR_TOLERANCE: TransformPixelTolerance = {
	meanAbsoluteError: 0.06,
	maxAbsoluteError: 0.45,
	maxOutlierFraction: 0,
	maxAlphaError: 0.02,
	minimumObservableEffect: 0.005,
};

// VP8/VP9 alpha BlockAdditional payloads are independently lossy-coded. Chromium's measured frontier
// is two 8-bit sample values; 0.008 admits that codec rounding but rejects the adjacent three-value loss.
const VPX_ALPHA_MAX_ERROR = 0.008;

function transform(
	value: Pick<TranscodeTransformContract, "steps" | "signal"> &
		Partial<
			Pick<
				TranscodeTransformContract,
				| "sourceSignal"
				| "tolerance"
				| "timestampToleranceUs"
				| "allowAlternatePixelMapping"
				| "minimumEffectCompletionRatio"
				| "pixelComparison"
			>
		>,
): TranscodeTransformContract {
	return defineTranscodeTransformContract({
		steps: value.steps,
		...(value.sourceSignal === undefined
			? {}
			: { sourceSignal: value.sourceSignal }),
		signal: value.signal,
		tolerance: value.tolerance ?? GEOMETRY_TOLERANCE,
		timestampToleranceUs: value.timestampToleranceUs ?? 1_000,
		allowAlternatePixelMapping: value.allowAlternatePixelMapping ?? false,
		...(value.minimumEffectCompletionRatio === undefined
			? {}
			: { minimumEffectCompletionRatio: value.minimumEffectCompletionRatio }),
		pixelComparison: value.pixelComparison ?? "strict",
	});
}

const TRANSFORM_CONTRACTS: Readonly<
	Record<string, TranscodeTransformContract>
> = Object.freeze({
	h264_rotate_normalize: transform({
		steps: [{ kind: "normalize-display-orientation" }],
		signal: { rotationDegrees: 0 },
		pixelComparison: "independent-perceptual",
	}),
	h264_rotate_180: transform({
		steps: [{ kind: "rotate", degrees: 180 }],
		signal: { rotationDegrees: 0 },
	}),
	h264_rotate_90_dimswap: transform({
		steps: [{ kind: "rotate", degrees: 90 }],
		signal: { rotationDegrees: 0 },
	}),
	h264_rotate_270_dimswap: transform({
		steps: [{ kind: "rotate", degrees: 270 }],
		signal: { rotationDegrees: 0 },
	}),
	h264_flip_horizontal: transform({
		steps: [{ kind: "flip", axis: "horizontal" }],
		signal: {},
	}),
	h264_flip_vertical: transform({
		steps: [{ kind: "flip", axis: "vertical" }],
		signal: {},
	}),
	h264_crop_center: transform({
		steps: [{ kind: "crop", x: 240, y: 135, width: 1_440, height: 810 }],
		signal: {},
	}),
	h264_pad_letterbox_4x3_to_16x9: transform({
		steps: [
			{
				kind: "contain-pad",
				width: 1_280,
				height: 720,
				placement: "center",
				color: [0, 0, 0, 1],
			},
		],
		signal: {},
	}),
	h264_colorspace_709_to_2020: transform({
		steps: [{ kind: "color-convert", from: "bt709", to: "bt2020" }],
		signal: {
			colorPrimaries: "bt2020",
			transfer: "bt2020-10",
			matrix: "bt2020-ncl",
			range: "limited",
			bitDepth: 8,
		},
		tolerance: COLOR_TOLERANCE,
		allowAlternatePixelMapping: true,
		minimumEffectCompletionRatio: 0.9,
	}),
	h264_8bit_to_hevc_10bit: transform({
		steps: [{ kind: "depth-convert", fromBitDepth: 8, toBitDepth: 10 }],
		signal: { bitDepth: 10 },
		tolerance: {
			...COLOR_TOLERANCE,
			meanAbsoluteError: 1 / 1023,
			maxAbsoluteError: 1 / 1023,
		},
		pixelComparison: "independent-perceptual",
	}),
	h264_10bit_to_h264_8bit: transform({
		steps: [{ kind: "depth-convert", fromBitDepth: 10, toBitDepth: 8 }],
		signal: { bitDepth: 8 },
		tolerance: {
			...COLOR_TOLERANCE,
			meanAbsoluteError: 1 / 255,
			maxAbsoluteError: 1 / 255,
		},
		pixelComparison: "independent-perceptual",
	}),
	hdr10_to_sdr_tonemap: transform({
		steps: [
			{
				kind: "tone-map",
				from: "pq-bt2020",
				to: "bt709-sdr",
				operator: "reinhard",
				targetPeakNits: 100,
			},
		],
		sourceSignal: {
			colorPrimaries: "bt2020",
			transfer: "pq",
			matrix: "bt2020-ncl",
			range: "limited",
			bitDepth: 10,
		},
		signal: {
			colorPrimaries: "bt709",
			transfer: "bt709",
			matrix: "bt709",
			range: "limited",
			bitDepth: 8,
		},
		tolerance: {
			...COLOR_TOLERANCE,
			meanAbsoluteError: 0.1,
			maxAbsoluteError: 0.6,
		},
		allowAlternatePixelMapping: true,
	}),
	vp9_alpha_to_vp9_keepalpha: transform({
		steps: [
			{ kind: "resize", width: 320, height: 240, filter: "bilinear" },
			{ kind: "preserve-alpha" },
		],
		signal: { alphaMode: "straight" },
		tolerance: { ...GEOMETRY_TOLERANCE, maxAlphaError: VPX_ALPHA_MAX_ERROR },
	}),
	vp9_alpha_to_vp8_keepalpha: transform({
		steps: [{ kind: "preserve-alpha" }],
		signal: { alphaMode: "straight" },
		tolerance: { ...GEOMETRY_TOLERANCE, maxAlphaError: VPX_ALPHA_MAX_ERROR },
	}),
});

const LOSSLESS_EXACT: TranscodeAudioContentContract = Object.freeze({
	// AudioDecoder/AudioContext exposes decoded FLAC as Float32; allow one signed-16 PCM step so the
	// neutral decoder's float conversion cannot fail a byte-lossless FLAC encode.
	kind: "lossless",
	maximumAbsoluteError: 1 / 32_768,
	sampleFrameTolerance: 0,
	requireExplicitTimeline: false,
});

function lossy(
	minimumSnrDb: number,
	maximumRmsError: number,
	minimumChannelCorrelation: number,
	requireExplicitTimeline: boolean,
	channelTransform?: TranscodeAudioContentContract["channelTransform"],
): TranscodeAudioContentContract {
	return Object.freeze({
		kind: "lossy",
		minimumSnrDb,
		maximumRmsError,
		minimumChannelCorrelation,
		sampleFrameTolerance: 0,
		requireExplicitTimeline,
		...(channelTransform ? { channelTransform } : {}),
	});
}

const AAC_TO_PCM_DECODER_EQUIVALENCE: TranscodeAudioContentContract =
	Object.freeze({
		// The source and candidate are decoded by independent AAC implementations (the browser and the
		// engine). Require exceptionally close aggregate agreement, while admitting the measured sparse
		// AAC decoder transient that cannot be judged by a signed-16 bit-exact maximum-error contract.
		kind: "decoder-equivalent",
		minimumSnrDb: 50,
		maximumRmsError: 0.001,
		maximumAbsoluteError: 0.1,
		minimumChannelCorrelation: 0.9999,
		sampleFrameTolerance: 0,
		requireExplicitTimeline: false,
	});

// FFmpeg-authored MP4 edit-list durations are expressed in the movie timescale. Admit only the
// observed sub-millisecond conversion band; AAC coded-frame accounting remains exact independently.
const AAC = Object.freeze({
	...lossy(18, 0.13, 0.85, true),
	sampleFrameTolerance: 32,
});
// The 48 kHz mono `01.wav` candidate is an adversarial tonal program for Opus' psychoacoustic model:
// AiBrush's pinned libopus wrapper measures 13.840 dB SNR at the requested 128 kbps, while independent
// FFmpeg 8.1.2 + libopus (`application=audio`, VBR, 20 ms, 128 kbps) measures 13.863 dB on the exact
// digest-bound input. Their much tighter RMS (0.01270/0.01267) and correlation (0.9791/0.9834) agree.
// Keep SNR conjunctive, but calibrate it below both independent encoders; RMS, correlation, exact sample
// count, explicit granule timing, and silence/channel-destruction regressions remain independently gated.
const OPUS = Object.freeze({
	...lossy(13.5, 0.1, 0.9, true),
	// When an independently decoded 44.1 kHz source is compared at Opus' fixed 48 kHz presentation
	// rate, Chromium AudioContext and the candidate decoder/resampler differ by at most 209 frames over
	// the exhaustive AAC/MP3/PCM corpus. Admit a round 5 ms reference-conversion band only for signals
	// explicitly marked as resampled; native 48 kHz Opus presentation accounting remains sample-exact.
	resampledSampleFrameTolerance: 240,
});
// MP3-in-MP4 uses a coarse media timescale in the vendored FFmpeg path. Keep the allowance below
// one millisecond at 44.1/48 kHz while still rejecting a coded-frame padding leak.
const MP3 = Object.freeze({
	...lossy(16, 0.16, 0.8, false),
	sampleFrameTolerance: 32,
});
const VORBIS = lossy(18, 0.14, 0.85, false);
const AAC_STEREO_TO_MONO = Object.freeze({
	...lossy(6, 0.3, 0.9, true, "stereo-to-mono-average"),
	// Chromium can expose up to 80 fewer decoded presentation frames for an AAC edit list whose
	// neutral structure is sample-exact. Keep the decoder-comparison band at 2ms; the independently
	// parsed coded/edit-list accounting still rejects the observed 768-frame encoder-tail leak.
	sampleFrameTolerance: 96,
});

const AUDIO_CONTRACTS: Readonly<Record<string, TranscodeAudioContentContract>> =
	Object.freeze({
		wav_to_aac_mp4: AAC,
		wav_to_opus_ogg: OPUS,
		wav_to_flac: LOSSLESS_EXACT,
		mp3_to_aac_mp4: AAC,
		flac_to_aac_mp4: AAC,
		aac_to_opus_webm: OPUS,
		aac_to_mp3_mp4: MP3,
		opus_to_aac_mp4: AAC,
		flac_to_opus_webm: OPUS,
		mp3_to_opus_webm: OPUS,
		wav_to_mp3_mp4: MP3,
		wav_to_vorbis_ogg: VORBIS,
		aac_to_pcm_wav_extract: AAC_TO_PCM_DECODER_EQUIVALENCE,
		gapless_pcm_to_aac_priming: AAC,
		gapless_pcm_to_opus_priming: OPUS,
		av_downmix_stereo_to_mono: AAC_STEREO_TO_MONO,
	});

export const TRANSCODE_ABR_CONTRACT: AbrSwitchingContract =
	defineAbrSwitchingContract({
		id: "h264-main-abr",
		renditions: [
			{
				id: "1080p",
				codec: "h264",
				width: 1920,
				height: 1080,
				targetBitrateBps: 5_000_000,
				minimumBitrateRatio: 0.7,
				maximumBitrateRatio: 1.3,
			},
			{
				id: "720p",
				codec: "h264",
				width: 1280,
				height: 720,
				targetBitrateBps: 2_800_000,
				minimumBitrateRatio: 0.7,
				maximumBitrateRatio: 1.3,
			},
			{
				id: "480p",
				codec: "h264",
				width: 854,
				height: 480,
				targetBitrateBps: 1_400_000,
				minimumBitrateRatio: 0.7,
				maximumBitrateRatio: 1.3,
			},
			{
				id: "360p",
				codec: "h264",
				width: 640,
				height: 360,
				targetBitrateBps: 800_000,
				minimumBitrateRatio: 0.7,
				maximumBitrateRatio: 1.3,
			},
		],
		durationToleranceUs: 34_000,
		alignmentToleranceUs: 1_000,
		requireCommonTimebase: true,
	});

/**
 * A single-output average-rate contract uses the same independently measured ±30% band as every
 * authored ABR rung. This is intentionally separate from the SSIM floor: rate and quality must both
 * pass, so an encoder cannot buy quality by silently emitting roughly twice the requested payload.
 */
export const TRANSCODE_H264_2MBPS_AVERAGE_BITRATE_CONTRACT: AverageVideoBitrateContract =
	defineAverageVideoBitrateContract({
		targetBitrateBps: 2_000_000,
		minimumBitrateRatio: 0.7,
		maximumBitrateRatio: 1.3,
	});

export function transcodeAverageVideoBitrateContractForScenario(
	scenarioId: string,
): AverageVideoBitrateContract | undefined {
	const id = localId(scenarioId);
	return id === "h264_bitrate_2mbps" || id === "h264_two_pass_bitrate"
		? TRANSCODE_H264_2MBPS_AVERAGE_BITRATE_CONTRACT
		: undefined;
}

export const TRANSCODE_ROUNDTRIP_CONTRACT: TranscodeRoundTripContract =
	defineTranscodeRoundTripContract({
		id: "h264-vp9-h264",
		sourceAssetId: "h264_1080p_30s.mp4",
		leg1ScenarioId: "transcode/roundtrip_leg1_h264_to_vp9",
		leg2ScenarioId: "transcode/roundtrip_leg2_vp9_to_h264",
	});

export function transcodeTransformContractForScenario(
	scenarioId: string,
): TranscodeTransformContract | undefined {
	return TRANSFORM_CONTRACTS[localId(scenarioId)];
}

export function transcodeTransformContractScenarioIds(): string[] {
	return Object.keys(TRANSFORM_CONTRACTS)
		.map((id) => `transcode/${id}`)
		.sort();
}

export function transcodeAudioContractForScenario(
	scenarioId: string,
): TranscodeAudioContentContract | undefined {
	return AUDIO_CONTRACTS[localId(scenarioId)];
}

export function transcodeAudioContractScenarioIds(): string[] {
	return Object.keys(AUDIO_CONTRACTS)
		.map((id) => `transcode/${id}`)
		.sort();
}

/** Scenario-specific metric contract built at the runner boundary after scenario normalization. */
export function transcodeMetricAdmissionContract(input: {
	oracles: readonly OracleId[];
	ssimMin?: number;
}): TranscodeMetricAdmissionContract {
	return defineTranscodeMetricAdmissionContract({
		mandatoryOracles: [...input.oracles],
		allowedDiffs: input.oracles.map((oracle) => ({
			oracle,
			reasonCodes: [
				"ORACLE_REPRESENTATION_DIFF",
				"TRANSCODE_TRANSFORM_ALTERNATE_VALID_MAPPING",
				"TRANSCODE_ABR_SWITCHABLE_WITH_REPRESENTATION_DIFF",
			],
		})),
		thresholds:
			input.ssimMin === undefined
				? []
				: [
						{
							id: "transcode-ssim-gate",
							measurement: "ssimScore",
							mode: "gating",
							comparator: "at-least",
							value: input.ssimMin,
						},
					],
	});
}

function localId(scenarioId: string): string {
	return scenarioId.startsWith("transcode/")
		? scenarioId.slice("transcode/".length)
		: scenarioId;
}
