import type {
	ApplicabilityTupleSummary,
	ConcreteOperationRequest,
	ConcreteWebCodecsConfig,
	NormalizedTrack,
	SerializableValue,
	SupportDecision,
} from "../../core/engine.ts";
import { decodeTrackSelectorFromOptions } from "../../features/decode-seek/track-selection.ts";
import { parseMuxTrackSelector } from "../../features/mux/selection.ts";

export const AIBRUSH_ENGINE_ID = "aibrush-media@dev";

const STILL_IMAGE_CONTAINERS = new Set(["jpeg", "jpg", "png", "webp"]);
const PCM_CONTAINERS = new Set(["wav", "aiff", "caf"]);
const PCM_CODECS = new Set([
	"pcm",
	"pcm-u8",
	"pcm-u8be",
	"pcm-s8",
	"pcm-s8be",
	"pcm-s16",
	"pcm-s16be",
	"pcm-s24",
	"pcm-s24be",
	"pcm-s32",
	"pcm-s32be",
	"pcm-f32",
	"pcm-f32be",
	"pcm-f64",
	"pcm-f64be",
]);
const VIDEO_ENCODERS = new Set(["h264", "hevc", "av1", "vp8", "vp9"]);
const DEMUX_VIDEO_CODECS = new Set([...VIDEO_ENCODERS, "mjpeg"]);
// `mp3` joined this set once @aibrush/media shipped its lazy LAME WebAssembly encode tail
// (`src/codecs/wasm-mp3-enc`). Verified against the installed build in a real browser: a 5.04 s 48 kHz
// stereo WAV converts to MP4 with an `mp4a.6b` track in 118 ms, the raw elementary stream carries 211
// valid MPEG-1 Layer III frames at the requested rate, and decoding that output back yields 241,920
// samples of non-silent PCM. No browser exposes an `AudioEncoder` for MP3, so this is a framework tail,
// not a platform capability.
const AUDIO_ENCODERS = new Set([
	"aac",
	"opus",
	"flac",
	"mp3",
	"vorbis",
	...PCM_CODECS,
]);
const DEMUX_AUDIO_CODECS = new Set([...AUDIO_ENCODERS]);
const LOSSY_TRIM_AUDIO_CODECS = new Set(["aac", "mp3", "opus"]);
const STILL_IMAGE_PROBE_VIDEO_CODEC = new Map<string, string>([
	["jpeg", "mjpeg"],
	["jpg", "mjpeg"],
	["png", "png"],
	["webp", "webp"],
]);
/**
 * General finite remux results become one contiguous returned `MediaBytes` payload in this adapter.
 * Explicit fragmented ISO buffer targets instead retain independently owned output parts and expose
 * bounded range reads, avoiding a contiguous allocation while preserving whole-output ownership.
 */
export const AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES = 1024 * 1024 * 1024;
export const AIBRUSH_MULTIPART_ISO_BUFFER_PUBLICATION_MAX_BYTES =
	1536 * 1024 * 1024;

interface Rejection {
	readonly reasonCode: string;
	readonly reason: string;
	readonly status?: "NA_ENGINE" | "NA_BROWSER";
	readonly preContent?: true;
}

export function decideAibrushSupport(
	request: ConcreteOperationRequest,
): SupportDecision {
	// A byte mutation is deliberately never reclassified as an unsupported clean tuple. The framework's
	// typed InputError/real fault path must remain observable to robustness scoring.
	if (request.inputs.some((input) => input.mutated)) return { supported: true };

	const rejection = rejectTuple(request);
	if (rejection !== undefined) {
		return {
			supported: false,
			status: rejection.status ?? "NA_ENGINE",
			reasonCode: rejection.reasonCode,
			reason: rejection.reason,
			...(rejection.preContent ? { preContent: true } : {}),
		};
	}

	const browserConfigs = concreteBrowserConfigs(request);
	return browserConfigs.length > 0
		? { supported: true, browserConfigs }
		: { supported: true };
}

function rejectTuple(request: ConcreteOperationRequest): Rejection | undefined {
	const operation = request.operation;
	const inputs = request.inputs;
	const inputContainers = inputs.map((input) => input.container.toLowerCase());
	const firstContainer = inputContainers[0];
	const outputContainer = request.output?.container.toLowerCase();
	const options = request.options;
	const fastStart = options.fastStart;
	const fragmented = options.fragmented === true || fastStart === "fragmented";
	const appendOnly = options.appendOnly === true;
	const target = options.target;
	const expectsNegativeRejection = expectsCleanInvalidRequestRejection(request);

	if (
		operation === "demux" &&
		inputs.some((input) =>
			input.tracks.some(
				(track) =>
					(track.type !== "video" &&
						track.type !== "audio" &&
						track.type !== "other") ||
					(track.type === "video" && !DEMUX_VIDEO_CODECS.has(track.codec)) ||
					(track.type === "audio" && !DEMUX_AUDIO_CODECS.has(track.codec)),
			),
		)
	) {
		return reject(
			"AIBRUSH_DEMUX_TRACK_REPRESENTATION_UNSUPPORTED",
			"the framework demux surface cannot expose every declared source media track in the normalized vocabulary",
		);
	}

	if (
		operation === "probe" &&
		inputs.some((input) =>
			input.tracks.some((track) => {
				if (track.type === "audio") return !DEMUX_AUDIO_CODECS.has(track.codec);
				if (track.type !== "video" || DEMUX_VIDEO_CODECS.has(track.codec))
					return false;
				// Still-image probes expose one normalized video-shaped metadata track, even though PNG/WebP
				// are not moving-video codecs. Admit only the exact representation authored by the selected
				// still container. MJPEG is already a product-observable media/attachment codec above.
				return (
					STILL_IMAGE_PROBE_VIDEO_CODEC.get(input.container.toLowerCase()) !==
					track.codec.toLowerCase()
				);
			}),
		)
	) {
		return reject(
			"AIBRUSH_PROBE_TRACK_REPRESENTATION_UNSUPPORTED",
			"the framework probe result contains a media codec outside the normalized adapter vocabulary",
		);
	}

	if (inputs.length === 0 && operation !== "mux") {
		return reject(
			"AIBRUSH_INPUT_REQUIRED",
			`${operation} requires a media input`,
		);
	}
	if (target !== undefined && target !== "buffer" && target !== "stream") {
		return reject(
			"AIBRUSH_OUTPUT_TARGET_UNKNOWN",
			`output target '${String(target)}' is not implemented`,
		);
	}
	if (
		fastStart !== undefined &&
		fastStart !== false &&
		fastStart !== true &&
		fastStart !== "in-memory" &&
		fastStart !== "fragmented" &&
		fastStart !== "reserve"
	) {
		return reject(
			"AIBRUSH_FASTSTART_MODE_UNKNOWN",
			`fastStart mode '${String(fastStart)}' is not implemented`,
		);
	}
	if (
		(options.positionedWrites === true || options.writeMode === "positioned") &&
		target !== "stream"
	) {
		return reject(
			"AIBRUSH_POSITIONED_WRITES_REQUIRE_STREAM_TARGET",
			"positioned-write evidence requires the callback-backed stream target",
		);
	}
	if (fastStart === "reserve" && target !== "stream") {
		return reject(
			"AIBRUSH_POSITIONED_RESERVE_REQUIRES_STREAM_TARGET",
			"reserved fast-start requires the callback-backed position-aware stream target",
		);
	}
	if (
		fastStart === "reserve" &&
		(!Number.isSafeInteger(options.maximumPacketCount) ||
			(options.maximumPacketCount as number) < 1)
	) {
		return reject(
			"AIBRUSH_MAXIMUM_PACKET_COUNT_INVALID",
			"reserved fast-start requires a positive safe-integer maximumPacketCount",
		);
	}
	if (fastStart !== "reserve" && options.maximumPacketCount !== undefined) {
		return reject(
			"AIBRUSH_MAXIMUM_PACKET_COUNT_WITHOUT_RESERVE",
			"maximumPacketCount is valid only with reserved fast-start",
		);
	}
	if (
		fastStart !== undefined &&
		fastStart !== false &&
		outputContainer !== "mp4" &&
		outputContainer !== "mov"
	) {
		return reject(
			"AIBRUSH_FASTSTART_CONTAINER_ILLEGAL",
			`fastStart applies only to mp4/mov output, not '${outputContainer ?? "missing"}'`,
		);
	}
	if (
		fragmented &&
		outputContainer !== "mp4" &&
		outputContainer !== "mov" &&
		outputContainer !== "webm" &&
		outputContainer !== "mkv"
	) {
		return reject(
			"AIBRUSH_FRAGMENTED_CONTAINER_ILLEGAL",
			`fragmented output is not implemented for '${outputContainer ?? "missing"}'`,
		);
	}
	if (
		appendOnly &&
		(operation !== "remux" ||
			(outputContainer !== "webm" && outputContainer !== "mkv"))
	) {
		return reject(
			"AIBRUSH_APPEND_ONLY_TUPLE_UNSUPPORTED",
			"append-only output is implemented only by the WebM/Matroska remux route",
		);
	}
	if (
		operation === "remux" &&
		fragmented &&
		(outputContainer === "webm" || outputContainer === "mkv") &&
		!appendOnly
	) {
		return reject(
			"AIBRUSH_WEBM_FRAGMENTED_WITHOUT_LIVE_UNSUPPORTED",
			"WebM/Matroska fragmented output requires the explicit appendOnly live contract",
		);
	}
	if (operation === "remux" && outputContainer !== undefined && !appendOnly) {
		const sourceBytes = knownTotalInputBytes(inputs);
		const publishesRangeArtifact =
			options.target === "stream" &&
			fragmented &&
			(outputContainer === "mp4" || outputContainer === "mov");
		const publishesMultipartIsoBuffer =
			options.target === "buffer" &&
			fragmented &&
			(outputContainer === "mp4" || outputContainer === "mov");
		// WebM/MKV streaming remux is bounded (≤128MiB) regardless of total output size; it should
		// not be gated by the finite 1 GiB whole-output ceiling. This is general (any WebM/MKV
		// remux with a streaming-capable source) and matches the engine's `requiresStreamingWebmRemux`,
		// but only up to the verified 1 GiB publication limit — beyond that the harness has no
		// verified streaming artifact size, so the 1 GiB ceiling remains the honest NA.
		const isStreamingWebmTarget =
			(outputContainer === "webm" || outputContainer === "mkv") &&
			sourceBytes !== undefined &&
			sourceBytes > 64 * 1024 * 1024 &&
			sourceBytes <= AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES;
		const publicationLimit = publishesMultipartIsoBuffer
			? AIBRUSH_MULTIPART_ISO_BUFFER_PUBLICATION_MAX_BYTES
			: AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES;
		if (
			!publishesRangeArtifact &&
			!isStreamingWebmTarget &&
			sourceBytes !== undefined &&
			sourceBytes > publicationLimit
		) {
			return rejectPreContent(
				"AIBRUSH_FINITE_REMUX_OUTPUT_SIZE_UNSUPPORTED",
				`finite remux publication for ${sourceBytes} declared source bytes exceeds the verified ` +
					`${publicationLimit}-byte complete-payload retention ceiling`,
			);
		}
	}

	if (
		firstContainer !== undefined &&
		STILL_IMAGE_CONTAINERS.has(firstContainer)
	) {
		if (
			operation !== "probe" &&
			operation !== "decodeFrames" &&
			!(operation === "transcode" && expectsNegativeRejection)
		) {
			return reject(
				"AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED",
				`${operation} has no coded-packet/container route for still-image input '${firstContainer}'`,
			);
		}
		if (
			operation === "decodeFrames" &&
			typeof (globalThis as typeof globalThis & { ImageDecoder?: unknown })
				.ImageDecoder !== "function"
		) {
			return reject(
				"AIBRUSH_IMAGE_DECODER_UNAVAILABLE",
				"the browser does not expose ImageDecoder for the requested still-image decode",
				"NA_BROWSER",
			);
		}
	}

	if (operation === "trim") {
		if (
			firstContainer !== undefined &&
			outputContainer !== undefined &&
			firstContainer !== outputContainer
		) {
			return reject(
				"AIBRUSH_TRIM_CONTAINER_CHANGE_UNSUPPORTED",
				`trim preserves '${firstContainer}' and cannot author requested '${outputContainer}' output`,
			);
		}
	}

	if (operation === "decrypt") {
		// Negative capability rows intentionally omit `requires.encryption` so the adapter must examine
		// the request and reject it at runtime. Keep container-family routing truthful by falling back to
		// the concrete operation option, while retaining declared ClearKey as a normal capability miss.
		const optionScheme =
			typeof options.scheme === "string" ? options.scheme : undefined;
		const scheme = request.encryption ?? optionScheme;
		if (request.encryption === "clearkey") {
			return reject(
				"AIBRUSH_DECRYPT_SCHEME_UNSUPPORTED",
				"ClearKey/EME is not a clear-output decrypt route",
			);
		}
		if (
			(scheme === "hls-aes128" || scheme === "hls-sample-aes") &&
			firstContainer !== "hls"
		) {
			return reject(
				"AIBRUSH_HLS_INPUT_REQUIRED",
				`${scheme} requires an HLS playlist input`,
			);
		}
		if (
			(scheme === "cenc-ctr" ||
				scheme === "cenc-cens" ||
				scheme === "cenc-cbcs") &&
			firstContainer !== undefined &&
			firstContainer !== "mp4" &&
			firstContainer !== "mov"
		) {
			return reject(
				"AIBRUSH_CENC_INPUT_REQUIRED",
				`${scheme ?? "CENC"} requires ISO BMFF input`,
			);
		}
	}

	const tracks = inputs.flatMap((input) => input.tracks);
	const codecs = tracks.map((track) => track.codec.toLowerCase());
	// Same-container MP3→MP3 exact trim is no longer a packet-copy problem for @aibrush/media. The old
	// declaration assumed the decoder had to be warmed by replaying whole source frames, which does blow
	// the 12-bit LAME delay field (measured: the 5 s cut of `mp3_xing.mp3` needs 5–6 lead frames, delay
	// 6804). The engine instead synthesizes one silent Layer III carrier frame holding exactly the bytes
	// the first target frame borrows through its bit reservoir (a ≤511-byte dependency, not a frame one),
	// so the lead-in collapses to 2 frames on MPEG-1 / 3 on MPEG-2/2.5 and the authored delay is always
	// inside the field. Verified over 5 fixtures × 56 trim points against ffmpeg as an independent
	// decoder: bit-exact over the authored window in every case.
	const singleTrackMp3Program =
		inputContainers.length === 1 &&
		firstContainer === "mp3" &&
		outputContainer === "mp3" &&
		tracks.length === 1 &&
		codecs[0] === "mp3";
	if (
		operation === "trim" &&
		options.invariant === "trim-audio-content" &&
		tracks.length > 0 &&
		tracks.every((track) => track.type === "audio") &&
		tracks.some((track) =>
			LOSSY_TRIM_AUDIO_CODECS.has(track.codec.toLowerCase()),
		) &&
		!singleTrackMp3Program &&
		!(
			inputContainers.length === 1 &&
			firstContainer === "ogg" &&
			outputContainer === "ogg" &&
			tracks.length === 1 &&
			codecs[0] === "opus"
		)
	) {
		// The reason names the container's own obstacle: raw ADTS access units for ADTS, the generic packet-copy
		// presentation-window limit for every other lossy audio container.
		return reject(
			"AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED",
			firstContainer === "adts"
				? "raw ADTS carries whole AAC access units with no delay/padding field and no edit list, and AAC-LC's 50%-overlap 2048-sample MDCT makes the first copied access unit decode differently from the source, so the exact decoded presentation window is not authorable outside same-container Ogg Opus granule or MP3 Xing/LAME authoring"
				: "the packet-copy trim surface cannot author the exact decoded presentation window outside same-container Ogg Opus granule or MP3 Xing/LAME authoring",
		);
	}
	if (operation === "remux" && outputContainer !== undefined) {
		const assessFlacInputsIndependently =
			outputContainer === "flac" &&
			inputs.length > 1 &&
			inputContainers.every((container) => container === "flac") &&
			options.invariant === "flac-seek-lands-identical-with-without-seektable";
		const legalityTrackGroups = assessFlacInputsIndependently
			? inputs.map((input) =>
					input.tracks.filter((track) => !isAttachedPicture(track)),
				)
			: [muxTracksAfterSelection(inputs, options)];
		for (const inputTracks of legalityTrackGroups) {
			const legality = rejectContainerCodecs(
				outputContainer,
				inputTracks,
				"remux",
			);
			if (legality !== undefined) return legality;
		}
		if (PCM_CONTAINERS.has(outputContainer)) {
			const sameContainer =
				inputContainers.length === 1 && inputContainers[0] === outputContainer;
			if (
				!sameContainer ||
				tracks.some(
					(track) => track.type !== "audio" || !isPcmCodec(track.codec),
				)
			) {
				return reject(
					"AIBRUSH_PCM_REMUX_TUPLE_ILLEGAL",
					`lossless remux to '${outputContainer}' requires same-container PCM audio input`,
				);
			}
		}
	}

	if (
		operation === "mux" &&
		outputContainer !== undefined &&
		tracks.length > 0
	) {
		const selectedTracks = muxTracksAfterSelection(inputs, options);
		const legality = rejectContainerCodecs(
			outputContainer,
			selectedTracks,
			"mux",
		);
		if (legality !== undefined) return legality;
	}

	if (operation === "transcode") {
		const requestedDimensions = [
			request.output?.width,
			request.output?.height,
			request.transforms?.resize?.width,
			request.transforms?.resize?.height,
		];
		if (
			requestedDimensions.some(
				(value) => typeof value === "number" && value <= 0,
			) && !expectsNegativeRejection
		) {
			return reject(
				"AIBRUSH_INVALID_DIMENSIONS",
				"video dimensions must be positive before probing a concrete browser encoder configuration",
			);
		}
	}

	if (operation === "transcode" && outputContainer !== undefined) {
		const outputVideo = request.output?.videoCodec?.toLowerCase();
		const outputAudio = request.output?.audioCodec?.toLowerCase();
		if (outputVideo !== undefined && !VIDEO_ENCODERS.has(outputVideo)) {
			return reject(
				"AIBRUSH_VIDEO_ENCODER_UNAVAILABLE",
				`no declared video encoder for '${outputVideo}'`,
			);
		}
		if (outputAudio !== undefined && !AUDIO_ENCODERS.has(outputAudio)) {
			return reject(
				"AIBRUSH_AUDIO_ENCODER_UNAVAILABLE",
				`no declared audio encoder for '${outputAudio}'`,
			);
		}
		const outputTracks: NormalizedTrack[] = [
			...(outputVideo !== undefined
				? [{ type: "video" as const, codec: outputVideo }]
				: []),
			...(outputAudio !== undefined
				? [{ type: "audio" as const, codec: outputAudio }]
				: []),
		];
		if (outputTracks.length > 0) {
			const legality = rejectContainerCodecs(
				outputContainer,
				outputTracks,
				"transcode",
			);
			if (legality !== undefined) return legality;
		}
		if (PCM_CONTAINERS.has(outputContainer) && outputVideo !== undefined) {
			return reject(
				"AIBRUSH_PCM_CONTAINER_VIDEO_ILLEGAL",
				`PCM container '${outputContainer}' cannot carry video codec '${outputVideo}'`,
			);
		}
		if (
			PCM_CONTAINERS.has(outputContainer) &&
			outputAudio !== undefined &&
			!isPcmCodec(outputAudio)
		) {
			return reject(
				"AIBRUSH_PCM_CONTAINER_CODEC_ILLEGAL",
				`PCM container '${outputContainer}' cannot carry '${outputAudio}'`,
			);
		}

		const invariant =
			typeof options.invariant === "string" ? options.invariant : "";
		const sourceAudioRate = tracks.find(
			(track) => track.type === "audio",
		)?.sampleRate;
		const requiredAudioRate =
			request.output?.sampleRate ??
			(outputAudio === "opus" ? 48_000 : sourceAudioRate);
		if (
			invariant === "transcode-audio-content" &&
			outputAudio === "opus" &&
			requiredAudioRate !== undefined &&
			requiredAudioRate !== 48_000
		) {
			return reject(
				"AIBRUSH_OPUS_FIXED_RATE_CONTRACT_UNSUPPORTED",
				`Opus presents at its fixed 48 kHz clock and cannot author the requested ${requiredAudioRate} Hz output rate`,
			);
		}
	}

	if (
		operation === "mux" &&
		outputContainer !== undefined &&
		tracks.length === 0 &&
		codecs.length === 0
	) {
		// The preliminary request deliberately has no golden tracks. Defer until the evidence-rich support
		// pass instead of guessing an illegal tuple from absence of evidence.
		return undefined;
	}
	return undefined;
}

/** Mirror the adapter's canonical mux selector semantics before output-container legality checks. */
function muxTracksAfterSelection(
	inputs: ConcreteOperationRequest["inputs"],
	options: ConcreteOperationRequest["options"],
): NormalizedTrack[] {
	const timedTracks = inputs.flatMap((input) =>
		input.tracks.filter((track) => !isAttachedPicture(track)),
	);
	const raw = options.trackSelect;
	if (!Array.isArray(raw) || raw.length === 0) return timedTracks;

	const candidates = inputs.flatMap((input, sourceIndex) => {
		const ordinals = new Map<"video" | "audio", number>();
		return input.tracks.flatMap((track) => {
			if (
				(track.type !== "video" && track.type !== "audio") ||
				isAttachedPicture(track)
			)
				return [];
			const typeOrdinal = ordinals.get(track.type) ?? 0;
			ordinals.set(track.type, typeOrdinal + 1);
			return [{ track, sourceIndex, typeOrdinal }];
		});
	});
	const selected: NormalizedTrack[] = [];
	const seen = new Set<NormalizedTrack>();
	for (const value of raw) {
		if (typeof value !== "string") continue;
		const selector = parseMuxTrackSelector(value);
		const sourceIndex = selector.sourceIndex ?? 0;
		const candidate = candidates.find(
			(entry) =>
				entry.sourceIndex === sourceIndex &&
				entry.track.type === selector.type &&
				entry.typeOrdinal === selector.typeOrdinal,
		);
		if (candidate !== undefined && !seen.has(candidate.track)) {
			seen.add(candidate.track);
			selected.push(candidate.track);
		}
	}
	return selected;
}

/** FFprobe's attached_pic disposition proves a video-shaped stream is container metadata, not media. */
function isAttachedPicture(track: NormalizedTrack): boolean {
	const attached = track.disposition?.attached_pic;
	return attached === true || attached === 1;
}

function rejectContainerCodecs(
	container: string,
	tracks: readonly NormalizedTrack[],
	operation: "remux" | "mux" | "transcode",
): Rejection | undefined {
	if (tracks.length === 0) return undefined;
	const video = tracks
		.filter((track) => track.type === "video")
		.map((track) => track.codec.toLowerCase());
	const audio = tracks
		.filter((track) => track.type === "audio")
		.map((track) => track.codec.toLowerCase());
	const illegal = (reason: string): Rejection =>
		reject(
			"AIBRUSH_CONTAINER_CODEC_ILLEGAL",
			`${operation} ${container}: ${reason}`,
		);

	switch (container) {
		case "mp4":
		case "mov":
			if (
				video.some((codec) => !["h264", "hevc", "av1", "vp9"].includes(codec))
			) {
				return illegal(
					`video codec(s) ${video.join(",")} are not implemented by the ISO BMFF writer`,
				);
			}
			if (audio.some((codec) => !["aac", "opus", "mp3"].includes(codec))) {
				return illegal(
					`audio codec(s) ${audio.join(",")} are not implemented by the ISO BMFF writer`,
				);
			}
			return undefined;
		case "webm":
			if (video.some((codec) => !["vp8", "vp9", "av1"].includes(codec))) {
				return illegal(
					`video codec(s) ${video.join(",")} violate WebM legality`,
				);
			}
			if (audio.some((codec) => !["opus", "vorbis"].includes(codec))) {
				return illegal(
					`audio codec(s) ${audio.join(",")} violate WebM legality`,
				);
			}
			return undefined;
		case "mkv":
			return undefined;
		case "ogg":
			return video.length > 0 ||
				audio.length === 0 ||
				audio.some((codec) => !["opus", "vorbis", "flac"].includes(codec))
				? illegal("Ogg output requires Opus, Vorbis, or FLAC audio only")
				: undefined;
		case "ts":
			return video.some((codec) => !["h264", "hevc"].includes(codec)) ||
				audio.some((codec) => !["aac", "mp3"].includes(codec))
				? illegal("MPEG-TS output supports H.264/HEVC video with AAC/MP3 audio")
				: undefined;
		case "adts":
			return video.length > 0 || audio.length !== 1 || audio[0] !== "aac"
				? illegal("ADTS output requires exactly one AAC audio track")
				: undefined;
		case "mp3":
			return video.length > 0 || audio.length !== 1 || audio[0] !== "mp3"
				? illegal("MP3 output requires exactly one MP3 audio track")
				: undefined;
		case "flac":
			return video.length > 0 || audio.length !== 1 || audio[0] !== "flac"
				? illegal("FLAC output requires exactly one FLAC audio track")
				: undefined;
		case "wav":
		case "aiff":
		case "caf":
			return video.length > 0 ||
				audio.length === 0 ||
				audio.some((codec) => !isPcmCodec(codec))
				? illegal(`${container} output requires PCM audio only`)
				: undefined;
		default:
			return reject(
				"AIBRUSH_OUTPUT_CONTAINER_UNSUPPORTED",
				`no output route for container '${container}'`,
			);
	}
}

function concreteBrowserConfigs(
	request: ConcreteOperationRequest,
): ConcreteWebCodecsConfig[] {
	// A negative contract is scored on the operation's typed clean rejection. Decoder/encoder configs
	// describe the successful-output path and are therefore unreachable for a conforming negative
	// request; preflighting them can hide the rejection behind an unrelated NA_BROWSER (for example,
	// an odd-width still-image candidate paired with an H.264 target). Execute the operation and let
	// the runner distinguish a clean rejection from a fault or suspicious returned output.
	if (expectsCleanInvalidRequestRejection(request)) return [];

	const configs: ConcreteWebCodecsConfig[] = [];
	const tracks = request.inputs.flatMap((input) => input.tracks);
	const operation = request.operation;
	const needsDecode =
		operation === "decodeFrames" ||
		operation === "seek" ||
		(operation === "trim" &&
			request.transforms?.trim?.frameAccurate === true) ||
		operation === "transcode";

	if (needsDecode) {
		const decodeTracks =
			operation === "decodeFrames"
				? exactSelectedDecodeTracks(request)
				: tracks.map((track, trackIndex) => ({ track, trackIndex }));
		decodeTracks.forEach(({ track, trackIndex }) => {
			const config = decoderConfig(track, trackIndex);
			if (config !== undefined) configs.push(config);
		});
	}

	if (
		operation === "transcode" ||
		(operation === "trim" && request.transforms?.trim?.frameAccurate === true)
	) {
		const sourceVideo = tracks.find((track) => track.type === "video");
		const sourceAudio = tracks.find((track) => track.type === "audio");
		const abrEncoderConfigs =
			operation === "transcode"
				? h264AbrEncoderConfigs(request, sourceVideo)
				: undefined;
		const videoCodec =
			request.output?.videoCodec ??
			(operation === "trim" ? sourceVideo?.codec : undefined);
		const audioCodec =
			request.output?.audioCodec ??
			(operation === "trim" ? sourceAudio?.codec : undefined);
		if (abrEncoderConfigs !== undefined) {
			configs.push(...abrEncoderConfigs);
		} else if (videoCodec !== undefined) {
			const width = request.output?.width ?? sourceVideo?.width;
			const height = request.output?.height ?? sourceVideo?.height;
			const rawBitDepth = plainRecord(request.options.video)?.bitDepth;
			const requestedBitDepth =
				typeof rawBitDepth === "number" ? rawBitDepth : undefined;
			const gracefulStaticResizeRejection =
				operation === "transcode" &&
				request.options.gracefulAllowOutput === true &&
				request.transforms?.resize !== undefined &&
				width !== undefined &&
				height !== undefined &&
				(width < 2 || height < 2);
			// The framework rejects a positive resize dimension below two pixels synchronously, before it
			// constructs a VideoEncoder. Let that authored graceful-failure boundary execute; probing a
			// configuration the operation cannot reach would turn a clean product rejection into NA_BROWSER.
			// Source decoder configs above remain intact, and ordinary invalid requests keep their exact
			// support behavior (negative requests returned before codec preflight above).
			if (
				width !== undefined &&
				height !== undefined &&
				!gracefulStaticResizeRejection
			) {
				const framerate = request.output?.frameRate ?? sourceVideo?.fps ?? 30;
				configs.push({
					role: "video-encoder",
					config: {
						codec: videoEncoderCodecString(
							videoCodec,
							width,
							height,
							framerate,
							requestedBitDepth,
						),
						width,
						height,
						bitrate: 2_000_000,
						framerate,
					},
				});
			}
		}
		// Opus has a registered WASM encoder tail; AAC encode does not and therefore requires this exact
		// browser AudioEncoder configuration.
		if (audioCodec === "aac") {
			const sampleRate = request.output?.sampleRate ?? sourceAudio?.sampleRate;
			const channels = request.output?.channels ?? sourceAudio?.channels;
			if (sampleRate !== undefined && channels !== undefined) {
				configs.push({
					role: "audio-encoder",
					config: {
						codec: webCodecString(audioCodec, "encode"),
						sampleRate,
						numberOfChannels: channels,
						bitrate: 128_000,
					},
				});
			}
		}
	}

	const invariant =
		typeof request.options.invariant === "string"
			? request.options.invariant
			: "";
	if (operation === "mux" && /decode\s*\(/i.test(invariant)) {
		tracks.forEach((track, trackIndex) => {
			const config = decoderConfig(track, trackIndex);
			if (config !== undefined) configs.push(config);
		});
	}
	return dedupeConfigs(configs);
}

/**
 * Public decode `trackSelect` configures only the requested per-type stream. Browser applicability must
 * mirror that route: an unsupported unselected track cannot veto a concrete alternate-track request.
 * Resolution precedence intentionally matches the adapter's evidence resolver.
 */
function exactSelectedDecodeTracks(
	request: ConcreteOperationRequest,
): Array<{ readonly track: NormalizedTrack; readonly trackIndex: number }> {
	const tracks = request.inputs[0]?.tracks ?? [];
	const selector = decodeTrackSelectorFromOptions(request.options);
	if (selector === undefined)
		return tracks.map((track, trackIndex) => ({ track, trackIndex }));
	const candidates = tracks.flatMap((track, trackIndex) =>
		track.type === selector.type ? [{ track, trackIndex }] : [],
	);
	const byIndex =
		selector.trackIndex === undefined
			? undefined
			: candidates.find(
					(candidate) => candidate.trackIndex === selector.trackIndex,
				);
	const byOrdinal =
		selector.typeOrdinal === undefined
			? undefined
			: candidates[selector.typeOrdinal];
	const byId =
		selector.trackId === undefined
			? undefined
			: candidates.find(
					(candidate) => candidate.track.trackId === selector.trackId,
				);
	const chosen = byIndex ?? byOrdinal ?? byId;
	if (chosen === undefined) return [];
	const typeOrdinal = candidates.findIndex(
		(candidate) => candidate.trackIndex === chosen.trackIndex,
	);
	if (
		selector.trackIndex !== undefined &&
		chosen.trackIndex !== selector.trackIndex
	)
		return [];
	if (
		selector.typeOrdinal !== undefined &&
		typeOrdinal !== selector.typeOrdinal
	)
		return [];
	if (
		selector.trackId !== undefined &&
		chosen.track.trackId !== selector.trackId
	)
		return [];
	return [chosen];
}

/** Mirror every exact encoder configuration the H.264 ladder operation will instantiate. */
function h264AbrEncoderConfigs(
	request: ConcreteOperationRequest,
	sourceVideo: NormalizedTrack | undefined,
): ConcreteWebCodecsConfig[] | undefined {
	const authored = request.options.variants;
	if (!Array.isArray(authored) || authored.length === 0) return undefined;
	const topLevelVideo = plainRecord(request.options.video);
	const inheritedCodec =
		typeof topLevelVideo?.codec === "string" ? topLevelVideo.codec : "h264";
	const configs: ConcreteWebCodecsConfig[] = [];
	for (const value of authored) {
		const variant = plainRecord(value);
		if (variant === undefined) continue;
		const codec =
			typeof variant.codec === "string" ? variant.codec : inheritedCodec;
		const width = typeof variant.width === "number" ? variant.width : undefined;
		const height =
			typeof variant.height === "number" ? variant.height : undefined;
		if (codec !== "h264" || width === undefined || height === undefined)
			continue;
		const framerate =
			typeof variant.fps === "number" ? variant.fps : (sourceVideo?.fps ?? 30);
		const quality = plainRecord(variant.quality);
		const constrained = quality?.metric === "ssim-luma-v1";
		const bitrate =
			typeof variant.bitrate === "number" ? variant.bitrate : 2_000_000;
		configs.push({
			role: "video-encoder",
			config: {
				codec: h264EncoderCodecStringForSource(
					width,
					height,
					framerate,
					sourceVideo?.nativeCodecTag,
				),
				width,
				height,
				latencyMode: "quality",
				...(constrained
					? { bitrateMode: "quantizer" as const }
					: { bitrate, bitrateMode: "variable" as const }),
				framerate,
			},
		});
	}
	return configs;
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function h264EncoderCodecStringForSource(
	width: number,
	height: number,
	framerate: number,
	sourceCodec: string | undefined,
): string {
	const sized = videoEncoderCodecString("h264", width, height, framerate);
	const level = sized.slice(-2);
	const profile = /^(?:avc1|avc3)\.([0-9a-f]{2})/i
		.exec(sourceCodec ?? "")?.[1]
		?.toUpperCase();
	const profileAndCompatibility =
		profile === "64" ? "6400" : profile === "4D" ? "4D00" : "42E0";
	return `avc1.${profileAndCompatibility}${level}`;
}

function decoderConfig(
	track: NormalizedTrack,
	trackIndex: number,
): ConcreteWebCodecsConfig | undefined {
	if (track.type === "video") {
		// The framework currently has no software H.264/HEVC decoder tail; these exact configurations are
		// therefore browser applicability. AV1/VPx have registered WASM fallbacks and are not browser-gated.
		if (track.codec !== "h264" && track.codec !== "hevc") return undefined;
		return {
			role: "video-decoder",
			trackIndex,
			config: {
				codec: decoderCodecString(track),
				...(track.width !== undefined ? { codedWidth: track.width } : {}),
				...(track.height !== undefined ? { codedHeight: track.height } : {}),
			},
		};
	}
	if (
		track.type === "audio" &&
		track.codec === "aac" &&
		/mp4a\.40\.(?:5|29)(?:$|\.)/i.test(track.nativeCodecTag ?? "")
	) {
		// The vendored WASM AAC fallback is AAC-LC only. HE-AAC/SBR/PS must use the exact native decoder
		// configuration; ordinary AAC-LC and Opus have software tails and are not browser applicability.
		if (track.sampleRate === undefined || track.channels === undefined)
			return undefined;
		return {
			role: "audio-decoder",
			trackIndex,
			config: {
				codec: webCodecString(track.nativeCodecTag ?? track.codec, "decode"),
				sampleRate: track.sampleRate,
				numberOfChannels: track.channels,
			},
		};
	}
	return undefined;
}

function decoderCodecString(track: NormalizedTrack): string {
	const declared = track.nativeCodecTag ?? track.codec;
	const bareAvc = /^(avc1|avc3)$/i.exec(declared.trim());
	if (track.codec.toLowerCase() !== "h264" || bareAvc === null) {
		return webCodecString(declared, "decode");
	}

	// ffprobe's MP4 sample-entry tag is only the bare `avc1`/`avc3` fourcc, while the product demux
	// expands the avcC profile/compatibility/level bytes before configuring VideoDecoder. Mirror that
	// concrete route from the retained normalized profile/level evidence; never ask WebCodecs to probe
	// the incomplete fourcc when the exact H.264 tuple is already known.
	const evidence = track as NormalizedTrack & {
		readonly profile?: unknown;
		readonly level?: unknown;
	};
	const profileAndCompatibility =
		typeof evidence.profile === "string"
			? H264_PROFILE_AND_COMPATIBILITY[evidence.profile.trim().toLowerCase()]
			: undefined;
	const level = evidence.level;
	if (
		profileAndCompatibility === undefined ||
		typeof level !== "number" ||
		!Number.isSafeInteger(level) ||
		level < 0 ||
		level > 0xff
	) {
		return declared;
	}
	return `${bareAvc[1]!.toLowerCase()}.${profileAndCompatibility}${level.toString(16).padStart(2, "0").toUpperCase()}`;
}

const H264_PROFILE_AND_COMPATIBILITY: Readonly<Record<string, string>> =
	Object.freeze({
		baseline: "4200",
		"constrained baseline": "42E0",
		main: "4D00",
		extended: "5800",
		high: "6400",
		"high 10": "6E00",
		"high 4:2:2": "7A00",
		"high 4:4:4 predictive": "F400",
	});

function webCodecString(
	codec: string,
	_direction: "decode" | "encode",
): string {
	if (/^(avc1|avc3|hvc1|hev1|av01|vp09|vp08|mp4a\.)/i.test(codec)) return codec;
	switch (codec.toLowerCase()) {
		case "h264":
			return "avc1.42E01E";
		case "hevc":
			return "hvc1.1.6.L93.B0";
		case "av1":
			return "av01.0.04M.08";
		case "vp9":
			return "vp09.00.10.08";
		case "vp8":
			return "vp8";
		case "aac":
			return "mp4a.40.2";
		default:
			return codec.toLowerCase();
	}
}

/**
 * Mirror the framework's dimension/cadence-aware H.264 level boundary for the exact browser probe.
 * A static avc1.42E01E (Level 3.0) is not a valid 1080p configuration and Chromium correctly rejects
 * it before the framework can synthesize the Level 4.0 config it actually instantiates.
 */
function videoEncoderCodecString(
	codec: string,
	width: number,
	height: number,
	framerate: number,
	bitDepth?: number,
): string {
	if (/^(avc1|avc3|hvc1|hev1|av01|vp09|vp08|mp4a\.)/i.test(codec)) return codec;
	if (codec.toLowerCase() === "hevc" && bitDepth === 10)
		return "hev1.2.4.L120.B0";
	if (codec.toLowerCase() !== "h264") return webCodecString(codec, "encode");

	const frameMacroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
	const macroblocksPerSecond = frameMacroblocks * Math.max(1, framerate);
	const levels = [
		{ idc: 0x1e, maxFrameMacroblocks: 1_620, maxMacroblocksPerSecond: 40_500 },
		{ idc: 0x1f, maxFrameMacroblocks: 3_600, maxMacroblocksPerSecond: 108_000 },
		{ idc: 0x20, maxFrameMacroblocks: 5_120, maxMacroblocksPerSecond: 216_000 },
		{ idc: 0x28, maxFrameMacroblocks: 8_192, maxMacroblocksPerSecond: 245_760 },
		{ idc: 0x2a, maxFrameMacroblocks: 8_704, maxMacroblocksPerSecond: 522_240 },
		{
			idc: 0x32,
			maxFrameMacroblocks: 22_080,
			maxMacroblocksPerSecond: 589_824,
		},
		{
			idc: 0x33,
			maxFrameMacroblocks: 36_864,
			maxMacroblocksPerSecond: 983_040,
		},
		{
			idc: 0x34,
			maxFrameMacroblocks: 36_864,
			maxMacroblocksPerSecond: 2_073_600,
		},
		{
			idc: 0x3c,
			maxFrameMacroblocks: 139_264,
			maxMacroblocksPerSecond: 4_177_920,
		},
		{
			idc: 0x3d,
			maxFrameMacroblocks: 139_264,
			maxMacroblocksPerSecond: 8_355_840,
		},
		{
			idc: 0x3e,
			maxFrameMacroblocks: 139_264,
			maxMacroblocksPerSecond: 16_711_680,
		},
	] as const;
	const level =
		levels.find(
			(candidate) =>
				frameMacroblocks <= candidate.maxFrameMacroblocks &&
				macroblocksPerSecond <= candidate.maxMacroblocksPerSecond,
		) ?? levels[levels.length - 1]!;
	return `avc1.42E0${level.idc.toString(16).padStart(2, "0").toUpperCase()}`;
}

function dedupeConfigs(
	configs: ConcreteWebCodecsConfig[],
): ConcreteWebCodecsConfig[] {
	const seen = new Set<string>();
	return configs.filter((entry) => {
		const key = `${entry.role}:${entry.trackIndex ?? -1}:${stableConfigKey(entry.config)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function stableConfigKey(config: object): string {
	return JSON.stringify(
		Object.entries(config).sort(([a], [b]) => a.localeCompare(b)),
	);
}

function isPcmCodec(codec: string): boolean {
	return (
		PCM_CODECS.has(codec.toLowerCase()) ||
		codec.toLowerCase().startsWith("pcm-")
	);
}

function knownTotalInputBytes(
	inputs: ConcreteOperationRequest["inputs"],
): number | undefined {
	let total = 0;
	for (const input of inputs) {
		if (
			input.sizeBytes === undefined ||
			!Number.isSafeInteger(input.sizeBytes) ||
			input.sizeBytes < 0
		) {
			return undefined;
		}
		total += input.sizeBytes;
		if (!Number.isSafeInteger(total)) return undefined;
	}
	return total;
}

function reject(
	reasonCode: string,
	reason: string,
	status: "NA_ENGINE" | "NA_BROWSER" = "NA_ENGINE",
): Rejection {
	return { reasonCode, reason, status };
}

function rejectPreContent(reasonCode: string, reason: string): Rejection {
	return { reasonCode, reason, status: "NA_ENGINE", preContent: true };
}

/**
 * A negative robustness contract authorizes execution only so the adapter can prove a typed clean
 * rejection. It does not broaden ordinary feature support and is deliberately independent of the
 * scenario id or fixture name.
 */
function expectsCleanInvalidRequestRejection(
	request: ConcreteOperationRequest,
): boolean {
	const robustness = plainRecord(request.options.robustness);
	return (
		robustness?.schema === "media-test/robustness-contract@1" &&
		robustness.inputClass === "negative"
	);
}

export function aibrushTupleSummary(
	request: ConcreteOperationRequest,
): ApplicabilityTupleSummary {
	const tracks = request.inputs.flatMap((input) => input.tracks);
	const options: Record<string, SerializableValue> = {};
	for (const key of [
		"target",
		"fragmented",
		"fastStart",
		"appendOnly",
		"writeChunkBytes",
		"positionedWrites",
		"writeMode",
		"frameAccurate",
		"reproducible",
	]) {
		const value = request.options[key];
		if (
			value === null ||
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			options[key] = value;
		}
	}
	return {
		inputContainers: request.inputs.map((input) => input.container),
		inputCodecs: tracks.map((track) => track.codec),
		outputCodecs: [
			request.output?.videoCodec,
			request.output?.audioCodec,
		].filter((codec): codec is string => codec !== undefined),
		...(request.output?.container !== undefined
			? { outputContainer: request.output.container }
			: {}),
		...(request.encryption !== undefined
			? { encryption: request.encryption }
			: {}),
		...(tracks.some(
			(track) => track.width !== undefined || track.height !== undefined,
		)
			? {
					dimensions: tracks.map((track) => ({
						...(track.width !== undefined ? { width: track.width } : {}),
						...(track.height !== undefined ? { height: track.height } : {}),
					})),
				}
			: {}),
		...(request.timingMode !== undefined
			? { timingMode: request.timingMode }
			: {}),
		...(Object.keys(options).length > 0 ? { options } : {}),
	};
}
