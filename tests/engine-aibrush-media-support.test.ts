import { describe, expect, test } from "bun:test";
import {
	CapabilityError,
	ConstraintUnsatisfiedError,
	InputError,
} from "@aibrush/media";
import {
	AUTHENTICATED_RANGE_PROBE_FEATURE,
	CONCRETE_OPERATION_PROTOCOL,
	SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
	isMalformedInputError,
	isNotApplicableError,
	isOperationConstraintUnsatisfiedError,
	validateCapabilitySet,
	type ConcreteOperationRequest,
	type MediaInput,
	type NormalizedTrack,
	type OperationContext,
	type OperationTelemetry,
	type TranscodeAudioOptions,
	type TranscodeVideoOptions,
} from "../src/core/engine.ts";
import {
	AibrushMediaEngine,
	aibrushDecodeRequiresExactFrameworkRoute,
	aibrushDirectDecodeFitsFrameBudget,
	aibrushDirectVideoDecoderConfig,
	mapAibrushTranscodeAudioTarget,
	mapAibrushTranscodeVideoTarget,
	resolveAibrushDecodeTrack,
	selectAibrushCopyTrimSampleIndices,
} from "../src/engines/aibrush-media/adapter.ts";
import {
	classifyAibrushFrameworkError,
	translateAibrushFrameworkError,
} from "../src/engines/aibrush-media/errors.ts";
import { sha256Hex } from "../src/engines/platform/digest.ts";
import {
	AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES,
	AIBRUSH_MULTIPART_ISO_BUFFER_PUBLICATION_MAX_BYTES,
	decideAibrushSupport,
} from "../src/engines/aibrush-media/support.ts";
import {
	buildAibrushDemuxResult,
	normalizeAibrushTrack,
} from "../src/engines/aibrush-media/representation.ts";
import { decodeNativePcm } from "../src/features/audio-dsp/index.ts";
import { defineDisplayTransform } from "../src/features/decode-seek/display.ts";
import { defineDemuxScaleContract } from "../src/features/demux/index.ts";
import { inspectTrimAudioContainer } from "../src/features/trim/audio.ts";
import { assessFragmentedTrimOutput } from "../src/features/trim/fragmented.ts";
import { readNeutralRemuxProgram } from "../src/features/remux/readers.ts";

const VIDEO: NormalizedTrack = {
	type: "video",
	codec: "h264",
	nativeCodecTag: "avc1.640028",
	width: 1_920,
	height: 1_080,
	fps: 30,
};
const AUDIO: NormalizedTrack = {
	type: "audio",
	codec: "aac",
	nativeCodecTag: "mp4a.40.2",
	sampleRate: 48_000,
	channels: 2,
};
const VP8_VIDEO: NormalizedTrack = {
	type: "video",
	codec: "vp8",
	width: 1_280,
	height: 720,
	fps: 30,
};
const VORBIS_AUDIO: NormalizedTrack = {
	type: "audio",
	codec: "vorbis",
	sampleRate: 48_000,
	channels: 2,
};

describe("REQ-ENG-32: aibrush-media concrete tuple applicability", () => {
	test("the declared still-image inputs are valid shared capability tokens", () => {
		const engine = new AibrushMediaEngine();
		const capabilities = validateCapabilitySet(engine);
		expect(capabilities.containersIn).toEqual(
			expect.arrayContaining(["jpeg", "png", "webp"]),
		);
		expect(capabilities.probeReadModes).toEqual(["range", "whole-file"]);
		expect(capabilities.features).toContain(AUTHENTICATED_RANGE_PROBE_FEATURE);
		expect(capabilities.features).toContain("two-pass");
		expect(capabilities.features).toContain("quality-constrained-rate");
		expect(capabilities.features).toContain("depth:10bit-output");
		expect(capabilities.features).toContain("mux:sparse-co64");
	});

	test("admits exact JPEG, PNG, and WebP probe representations without requiring ImageDecoder", () => {
		for (const [scenarioId, container, codec] of [
			["robustness/image_jpeg_probe", "jpeg", "mjpeg"],
			["robustness/image_png_probe", "png", "png"],
			["robustness/image_webp_probe", "webp", "webp"],
		] as const) {
			expect(
				decideAibrushSupport(
					request(
						"probe",
						container,
						[{ type: "video", codec, width: 640, height: 480 }],
						{
							scenarioId,
						},
					),
				),
				scenarioId,
			).toEqual({ supported: true });
		}
	});

	test("keeps ImageDecoder absence as browser applicability for still-image decode only", () => {
		const descriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"ImageDecoder",
		);
		try {
			Reflect.deleteProperty(globalThis, "ImageDecoder");
			for (const [container, codec] of [
				["jpeg", "mjpeg"],
				["png", "png"],
				["webp", "webp"],
			] as const) {
				expect(
					decideAibrushSupport(
						request("decodeFrames", container, [
							{ type: "video", codec, width: 640, height: 480 },
						]),
					),
					container,
				).toMatchObject({
					supported: false,
					status: "NA_BROWSER",
					reasonCode: "AIBRUSH_IMAGE_DECODER_UNAVAILABLE",
				});
			}
			Object.defineProperty(globalThis, "ImageDecoder", {
				configurable: true,
				writable: true,
				value: function ImageDecoder() {},
			});
			for (const [container, codec] of [
				["jpeg", "mjpeg"],
				["png", "png"],
				["webp", "webp"],
			] as const) {
				expect(
					decideAibrushSupport(
						request("decodeFrames", container, [
							{ type: "video", codec, width: 640, height: 480 },
						]),
					),
					container,
				).toEqual({ supported: true });
			}
		} finally {
			restoreGlobal("ImageDecoder", descriptor);
		}
	});

	test("assesses each FLAC SEEKTABLE-equivalence input independently at remux preflight", () => {
		const flacTrack: NormalizedTrack = {
			type: "audio",
			codec: "flac",
			sampleRate: 48_000,
			channels: 2,
		};
		const property = request("remux", "flac", [flacTrack], {
			scenarioId: "robustness/prop_flac_seek_seektable_equiv",
			outputContainer: "flac",
			options: {
				invariant: "flac-seek-lands-identical-with-without-seektable",
			},
		});
		property.inputs = [
			{
				...property.inputs[0]!,
				id: "flac_seektable.flac",
				tracks: [{ ...flacTrack }],
			},
			{
				...property.inputs[0]!,
				id: "flac_noseektable.flac",
				tracks: [{ ...flacTrack }],
			},
		];

		expect(decideAibrushSupport(property)).toEqual({ supported: true });

		expect(
			decideAibrushSupport({
				...property,
				scenarioId: "remux/two-flac-sources",
				options: {},
			}),
		).toMatchObject({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_CONTAINER_CODEC_ILLEGAL",
		});

		expect(
			decideAibrushSupport({
				...property,
				inputs: [
					property.inputs[0]!,
					{
						...property.inputs[1]!,
						tracks: [{ ...flacTrack }, { ...flacTrack }],
					},
				],
			}),
		).toMatchObject({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_CONTAINER_CODEC_ILLEGAL",
		});
	});

	test("declares display-matrix decode separately from authored rotation transforms", () => {
		const capabilities = validateCapabilitySet(new AibrushMediaEngine());
		expect(capabilities.features).toContain("rotation:decode");
		expect(capabilities.features).toContain("rotate");
	});

	test("routes a typed display-space contract around every default-track decode shortcut", () => {
		expect(aibrushDecodeRequiresExactFrameworkRoute({}, undefined)).toBe(false);
		expect(
			aibrushDecodeRequiresExactFrameworkRoute(
				{
					displayEvidence: defineDisplayTransform({
						codedWidth: 1_280,
						codedHeight: 720,
						displayWidth: 720,
						displayHeight: 1_280,
						rotationDegrees: 90,
						flipX: false,
						flipY: false,
					}),
				},
				undefined,
			),
		).toBe(true);
	});

	test.each([90, 180, 270])(
		"routes an observed %i° video track around coded-frame decode shortcuts",
		(rotation) => {
			expect(
				aibrushDecodeRequiresExactFrameworkRoute({}, undefined, [
					{ type: "audio" },
					{ type: "video", rotation },
				]),
			).toBe(true);
			expect(
				aibrushDecodeRequiresExactFrameworkRoute({}, undefined, [
					{ type: "video", rotation: 0 },
				]),
			).toBe(false);
		},
	);

	test("maps the authored two-pass request to the framework replay-backed option", () => {
		const twoPass = {
			codec: "h264",
			bitrate: 2_000_000,
			passes: 2,
		} as TranscodeVideoOptions & { passes: number };
		const onePass = { ...twoPass, passes: 1 };

		expect(mapAibrushTranscodeVideoTarget(twoPass)).toMatchObject({
			codec: "h264",
			bitrate: 2_000_000,
			twoPass: true,
		});
		expect(mapAibrushTranscodeVideoTarget(onePass)).not.toHaveProperty(
			"twoPass",
		);

		expect(
			mapAibrushTranscodeVideoTarget({
				...twoPass,
				maxAverageBitrate: 2_600_000,
				quality: { metric: "ssim-luma-v1", minimumMean: 0.93, samples: 8 },
			}),
		).toEqual({
			codec: "h264",
			bitrate: 2_000_000,
			maxAverageBitrate: 2_600_000,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.93, samples: 8 },
		});
	});

	test("maps the authored preferred/max-rate objective-quality tuple without redefining bitrate", () => {
		expect(
			mapAibrushTranscodeVideoTarget({
				codec: "h264",
				bitrate: 2_000_000,
				maxAverageBitrate: 2_600_000,
				quality: { metric: "ssim-luma-v1", minimumMean: 0.93, samples: 8 },
			}),
		).toEqual({
			codec: "h264",
			bitrate: 2_000_000,
			maxAverageBitrate: 2_600_000,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.93, samples: 8 },
		});
	});

	test("bounds adaptive reuse and cross-process memory sampling", () => {
		expect(new AibrushMediaEngine().benchmarkLimits).toEqual({
			maxInnerIterations: 1,
			memoryWindow: {
				sampleImmediatelyDuringOperation: true,
				maxOperationSamples: 1,
				settleWindowMs: 0,
				sampleTimeoutMs: 30_000,
			},
		});
	});

	test("rejects oversized finite remux publication before content execution without fixture routing", () => {
		const massiveFixtureBytes = 1_144_401_376;
		const oversized = request("remux", "mp4", [VIDEO, AUDIO], {
			scenarioId: "remux/arbitrary_large_input",
			inputId: "arbitrary.mp4",
			inputSizeBytes: massiveFixtureBytes,
			outputContainer: "mkv",
		});

		expect(decideAibrushSupport(oversized)).toEqual({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_FINITE_REMUX_OUTPUT_SIZE_UNSUPPORTED",
			reason:
				`finite remux publication for ${massiveFixtureBytes} declared ` +
				`source bytes exceeds the verified ${AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES}-byte ` +
				"complete-payload retention ceiling",
			preContent: true,
		});
	});

	test("keeps smaller finite remux rows and explicit append-only publication admitted", () => {
		expect(
			decideAibrushSupport(
				request("remux", "mp4", [VIDEO, AUDIO], {
					inputSizeBytes: 843_645_455,
					outputContainer: "mkv",
				}),
			),
		).toMatchObject({ supported: true });

		expect(
			decideAibrushSupport(
				request("remux", "mp4", [VIDEO, AUDIO], {
					inputSizeBytes: AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES + 1,
					outputContainer: "mkv",
					options: { appendOnly: true },
				}),
			),
		).toMatchObject({ supported: true });

		expect(
			decideAibrushSupport(
				request("remux", "mp4", [VIDEO, AUDIO], {
					inputSizeBytes: AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES + 1,
					outputContainer: "mp4",
					options: { target: "stream", fragmented: true },
				}),
			),
		).toMatchObject({ supported: true });

		const multipartBuffer = decideAibrushSupport(
			request("remux", "mp4", [VIDEO, AUDIO], {
				inputSizeBytes: AIBRUSH_FINITE_REMUX_PUBLICATION_MAX_BYTES + 1,
				outputContainer: "mp4",
				options: { target: "buffer", fragmented: true },
			}),
		);
		expect(multipartBuffer).toMatchObject({ supported: true });

		const oversizedBuffer = decideAibrushSupport(
			request("remux", "mp4", [VIDEO, AUDIO], {
				inputSizeBytes: AIBRUSH_MULTIPART_ISO_BUFFER_PUBLICATION_MAX_BYTES + 1,
				outputContainer: "mp4",
				options: { target: "buffer", fragmented: true },
			}),
		);
		expect(oversizedBuffer).toMatchObject({
			supported: false,
			reasonCode: "AIBRUSH_FINITE_REMUX_OUTPUT_SIZE_UNSUPPORTED",
		});
	});

	test("checks mux container legality after canonical selected-audio resolution", () => {
		expect(
			decideAibrushSupport(
				request("mux", "webm", [VP8_VIDEO, VORBIS_AUDIO], {
					scenarioId: "mux/vorbis_to_ogg",
					outputContainer: "ogg",
					options: { trackSelect: ["audio:0"] },
				}),
			),
		).toEqual({ supported: true });

		const sourceQualified: ConcreteOperationRequest = {
			...request("mux", "mp4", [VIDEO, AUDIO], {
				scenarioId: "mux/source_qualified_vorbis_to_ogg",
				outputContainer: "ogg",
				options: { trackSelect: ["audio:0@1"] },
			}),
			inputs: [
				{
					id: "video-source.mp4",
					mime: "video/mp4",
					container: "mp4",
					sizeBytes: 1_024,
					mutated: false,
					sourceEvidence: "RESOLVED",
					tracks: [VIDEO, AUDIO],
				},
				{
					id: "vorbis-source.webm",
					mime: "video/webm",
					container: "webm",
					sizeBytes: 1_024,
					mutated: false,
					sourceEvidence: "RESOLVED",
					tracks: [VP8_VIDEO, VORBIS_AUDIO],
				},
			],
		};
		expect(decideAibrushSupport(sourceQualified)).toEqual({ supported: true });
	});

	test("still rejects an illegal video track when mux trackSelect selects it", () => {
		for (const trackSelect of [["video:0"], ["video:0@1"]]) {
			const base = request("mux", "webm", [VP8_VIDEO, VORBIS_AUDIO], {
				outputContainer: "ogg",
				options: { trackSelect },
			});
			const selectedIllegal: ConcreteOperationRequest =
				trackSelect[0]?.includes("@1")
					? {
							...base,
							inputs: [
								{
									id: "audio-source.ogg",
									mime: "audio/ogg",
									container: "ogg",
									sizeBytes: 1_024,
									mutated: false,
									sourceEvidence: "RESOLVED",
									tracks: [VORBIS_AUDIO],
								},
								{
									id: "video-source.webm",
									mime: "video/webm",
									container: "webm",
									sizeBytes: 1_024,
									mutated: false,
									sourceEvidence: "RESOLVED",
									tracks: [VP8_VIDEO, VORBIS_AUDIO],
								},
							],
						}
					: base;
			expect(decideAibrushSupport(selectedIllegal)).toMatchObject({
				supported: false,
				status: "NA_ENGINE",
				reasonCode: "AIBRUSH_CONTAINER_CODEC_ILLEGAL",
			});
		}
	});

	test("bounds direct ISO-BMFF decode by decoded RGBA storage rather than a fixture-sized frame cap", () => {
		expect(
			aibrushDirectDecodeFitsFrameBudget(
				{ codedWidth: 320, codedHeight: 240 },
				240,
			),
		).toBe(true);
		expect(
			aibrushDirectDecodeFitsFrameBudget(
				{ codedWidth: 1_920, codedHeight: 1_080 },
				60,
			),
		).toBe(true);
		expect(
			aibrushDirectDecodeFitsFrameBudget(
				{ codedWidth: 3_840, codedHeight: 2_160 },
				30,
			),
		).toBe(false);
		expect(
			aibrushDirectDecodeFitsFrameBudget(
				{ codedWidth: 64, codedHeight: 64 },
				513,
			),
		).toBe(false);
		expect(
			aibrushDirectDecodeFitsFrameBudget(
				{ codedWidth: 0, codedHeight: 240 },
				1,
			),
		).toBe(false);
	});

	test.each([
		[4, 3],
		[3, 4],
		[224, 225],
	] as const)(
		"preserves %i:%i display aspect metadata in the bounded WebCodecs route",
		(displayAspectWidth, displayAspectHeight) => {
			expect(
				aibrushDirectVideoDecoderConfig({
					codec: "avc1.640028",
					codedWidth: 600,
					codedHeight: 448,
					displayAspectWidth,
					displayAspectHeight,
				}),
			).toMatchObject({
				codedWidth: 600,
				codedHeight: 448,
				displayAspectWidth,
				displayAspectHeight,
			});
		},
	);

	test.each([
		[4, undefined],
		[undefined, 3],
		[0, 3],
		[4, 0],
	] as const)(
		"does not construct a partial or invalid bounded-decode display aspect (%s:%s)",
		(displayAspectWidth, displayAspectHeight) => {
			const config = aibrushDirectVideoDecoderConfig({
				codec: "avc1.640028",
				codedWidth: 600,
				codedHeight: 448,
				displayAspectWidth,
				displayAspectHeight,
			});
			expect(config?.displayAspectWidth).toBeUndefined();
			expect(config?.displayAspectHeight).toBeUndefined();
		},
	);

	const rows: Array<[string, ConcreteOperationRequest, string]> = [
		[
			"still-image demux",
			request("demux", "jpeg", [], { outputContainer: undefined }),
			"AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED",
		],
		[
			"still-image remux",
			request("remux", "png", [], { outputContainer: "mp4" }),
			"AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED",
		],
		[
			"append-only MP4",
			request("remux", "mp4", [VIDEO, AUDIO], {
				outputContainer: "mp4",
				options: { appendOnly: true },
			}),
			"AIBRUSH_APPEND_ONLY_TUPLE_UNSUPPORTED",
		],
		[
			"AAC in WAV",
			request("mux", "mp4", [AUDIO], { outputContainer: "wav" }),
			"AIBRUSH_CONTAINER_CODEC_ILLEGAL",
		],
		[
			"video in PCM container",
			request("transcode", "mp4", [VIDEO], {
				outputContainer: "wav",
				videoCodec: "h264",
				audioCodec: "pcm-s16",
			}),
			"AIBRUSH_CONTAINER_CODEC_ILLEGAL",
		],
		[
			"unsupported encoder",
			request("transcode", "mp4", [VIDEO], {
				outputContainer: "mp4",
				videoCodec: "theora",
			}),
			"AIBRUSH_VIDEO_ENCODER_UNAVAILABLE",
		],
		[
			"reserved fast start without a positioned stream target",
			request("remux", "mp4", [VIDEO, AUDIO], {
				outputContainer: "mp4",
				options: { fastStart: "reserve" },
			}),
			"AIBRUSH_POSITIONED_RESERVE_REQUIRES_STREAM_TARGET",
		],
		[
			"positioned writes",
			request("mux", "mp4", [VIDEO], {
				outputContainer: "mp4",
				options: { target: "buffer", positionedWrites: true },
			}),
			"AIBRUSH_POSITIONED_WRITES_REQUIRE_STREAM_TARGET",
		],
	];

	for (const [name, tuple, reasonCode] of rows) {
		test(`rejects ${name} before execution with a stable NA_ENGINE reason`, () => {
			expect(decideAibrushSupport(tuple)).toMatchObject({
				supported: false,
				status: "NA_ENGINE",
				reasonCode,
			});
		});
	}

	test("admits Matroska VFR duration and B-frame decode-order mux tuples", () => {
		for (const scenarioId of [
			"mux/prop_vfr_mux_duration_mp4_to_mkv",
			"mux/edge_bframes_decode_mux_mkv",
		]) {
			expect(
				decideAibrushSupport(
					request("mux", "mp4", [VIDEO, AUDIO], {
						scenarioId,
						outputContainer: "mkv",
					}),
				),
				scenarioId,
			).toEqual({ supported: true });
		}
	});

	test("admits the legal append-only WebM and same-container PCM copy tuples", () => {
		expect(
			decideAibrushSupport(
				request(
					"remux",
					"webm",
					[
						{ type: "video", codec: "vp9" },
						{ type: "audio", codec: "opus" },
					],
					{
						outputContainer: "webm",
						options: { appendOnly: true, target: "stream" },
					},
				),
			),
		).toEqual({ supported: true });
		expect(
			decideAibrushSupport(
				request(
					"remux",
					"wav",
					[
						{
							type: "audio",
							codec: "pcm-s16",
							sampleRate: 48_000,
							channels: 2,
						},
					],
					{ outputContainer: "wav" },
				),
			),
		).toEqual({ supported: true });
	});

	test("admits and authors fragmented MP4 trim through the public driver-author surface", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/fragmented_cmaf.mp4").arrayBuffer(),
		);
		const input = rangeBackedInput("fragmented_cmaf.mp4", "video/mp4", bytes);
		const operationRequest = request("trim", "mp4", [VIDEO, AUDIO], {
			scenarioId: "trim/general_fragmented_mp4_copy",
			inputId: input.id,
			outputContainer: "mp4",
			options: {
				container: "mp4",
				frameAccurate: false,
				fragmented: true,
				range: { startUs: 2_021_354, endUs: 4_021_354 },
			},
			transforms: {
				trim: {
					startUs: 2_021_354,
					endUs: 4_021_354,
					frameAccurate: false,
				},
			},
		});
		expect(decideAibrushSupport(operationRequest)).toEqual({ supported: true });

		const fetchDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"fetch",
		);
		installRangeFetch(bytes);
		const context = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(context);
			const output = await engine.trim(
				input,
				{
					startUs: 2_021_354,
					endUs: 4_021_354,
				},
				{
					container: "mp4",
					frameAccurate: false,
					fragmented: true,
				},
				context,
			);
			expect(
				assessFragmentedTrimOutput(output.bytes, {
					requiredTrackTypes: ["video", "audio"],
					requireZeroBasedDecodeTime: true,
				}),
			).toMatchObject({
				state: "VERDICT",
				verdict: "PASS",
				reasonCode: "TRIM_FRAGMENT_STRUCTURE_VALID",
			});
			expect(engine.configUsed).toMatchObject({
				operation: "trim",
				route: "core.prepared-iso-copy-trim",
			});
		} finally {
			await engine.dispose(context);
			restoreGlobal("fetch", fetchDescriptor);
		}
	});

	test("returns exact source bytes for a declared same-container no-op trim", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/h264_1080p_30s.mp4").arrayBuffer(),
		);
		const input = rangeBackedInput("h264_1080p_30s.mp4", "video/mp4", bytes);
		const range = { startUs: 0, endUs: 30_000_000 };
		const operationRequest = request("trim", "mp4", [VIDEO, AUDIO], {
			inputId: input.id,
			outputContainer: "mp4",
			options: {
				container: "mp4",
				frameAccurate: false,
				invariant: "trim-noop-semantic-identity",
				range,
			},
			transforms: {
				trim: {
					...range,
					frameAccurate: false,
				},
			},
		});
		const context = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(context);
			const output = await engine.trim(
				input,
				range,
				{
					container: "mp4",
					frameAccurate: false,
				},
				context,
			);
			expect(output.bytes).toEqual(bytes);
			expect(engine.configUsed).toMatchObject({
				operation: "trim",
				route: "adapter.exact-source-identity",
			});
		} finally {
			await engine.dispose(context);
		}
	});

	test("rejects intrinsic and past-EOF MP4 trim ranges through lightweight structural validation", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/h264_1080p_30s.mp4").arrayBuffer(),
		);
		for (const [scenarioId, range, route, reason] of [
			[
				"trim/robust_generic_negative_start",
				{ startUs: -1, endUs: 1_000_000 },
				"adapter.intrinsic-range-validation",
				"trim start must be non-negative",
			],
			[
				"trim/robust_generic_start_past_eof",
				{ startUs: 40_000_000, endUs: 45_000_000 },
				"adapter.mp4-range-validation",
				"trim start lies at or past media duration",
			],
		] as const) {
			const input = rangeBackedInput("h264_1080p_30s.mp4", "video/mp4", bytes);
			const operationRequest = request("trim", "mp4", [VIDEO, AUDIO], {
				scenarioId,
				inputId: input.id,
				outputContainer: "mp4",
				options: {
					container: "mp4",
					frameAccurate: false,
					range,
				},
				transforms: {
					trim: {
						...range,
						frameAccurate: false,
					},
				},
			});
			const context = directContext(operationRequest);
			const engine = new AibrushMediaEngine();
			try {
				await engine.init(context);
				let thrown: unknown;
				try {
					await engine.trim(
						input,
						range,
						{
							container: "mp4",
							frameAccurate: false,
						},
						context,
					);
				} catch (error) {
					thrown = error;
				}
				expect(isMalformedInputError(thrown)).toBe(true);
				expect(thrown).toMatchObject({
					reasonCode: "AIBRUSH_REQUEST_REJECTED",
					operation: "trim",
					stage: "validate",
					reason,
				});
				expect(engine.configUsed).toMatchObject({
					operation: "trim",
					route,
				});
			} finally {
				await engine.dispose(context);
			}
		}
	});

	test("fragmented MP4 copy trim selects reordered H.264 access units on presentation time", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/h264_bframes_1080p.mp4").arrayBuffer(),
		);
		const range = { startUs: 2_021_354, endUs: 4_021_354 };
		const input = rangeBackedInput(
			"h264_bframes_1080p.mp4",
			"video/mp4",
			bytes,
		);
		const operationRequest = request("trim", "mp4", [VIDEO], {
			inputId: input.id,
			outputContainer: "mp4",
			options: {
				container: "mp4",
				frameAccurate: false,
				fragmented: true,
				range,
			},
			transforms: {
				trim: {
					...range,
					frameAccurate: false,
				},
			},
		});
		const source = readNeutralRemuxProgram(bytes, "mp4");
		expect(source.state).toBe("OK");
		if (source.state !== "OK") return;
		const sourceVideo = source.value.tracks.find(
			(track) => track.type === "video",
		);
		expect(sourceVideo).toBeDefined();
		if (sourceVideo === undefined) return;
		const selected = selectAibrushCopyTrimSampleIndices(sourceVideo, range);
		expect(selected.length).toBeGreaterThan(0);
		expect(selected[selected.length - 1]! - selected[0]! + 1).toBeGreaterThan(
			selected.length,
		);

		const fetchDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"fetch",
		);
		installRangeFetch(bytes);
		const context = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(context);
			const output = await engine.trim(
				input,
				range,
				{
					container: "mp4",
					frameAccurate: false,
					fragmented: true,
				},
				context,
			);
			expect(
				assessFragmentedTrimOutput(output.bytes, {
					requiredTrackTypes: ["video"],
					requireZeroBasedDecodeTime: true,
				}),
			).toMatchObject({
				state: "VERDICT",
				verdict: "PASS",
				reasonCode: "TRIM_FRAGMENT_STRUCTURE_VALID",
			});

			const trimmed = readNeutralRemuxProgram(output.bytes, "mp4");
			expect(trimmed.state).toBe("OK");
			if (trimmed.state !== "OK") return;
			const trimmedVideo = trimmed.value.tracks.find(
				(track) => track.type === "video",
			);
			expect(trimmedVideo).toBeDefined();
			expect(trimmedVideo?.samples.map((sample) => sample.payload)).toEqual(
				selected.map((index) => sourceVideo.samples[index]!.payload),
			);
			expect(engine.configUsed).toMatchObject({
				operation: "trim",
				route: "core.prepared-iso-copy-trim",
			});
		} finally {
			await engine.dispose(context);
			restoreGlobal("fetch", fetchDescriptor);
		}
	});

	test("returns the exact HEVC browser re-import decoder configuration", () => {
		const decision = decideAibrushSupport(
			request(
				"mux",
				"mp4",
				[
					{
						type: "video",
						codec: "hevc",
						nativeCodecTag: "hvc1.1.6.L93.B0",
						width: 1_280,
						height: 720,
					},
				],
				{
					outputContainer: "mp4",
					options: { invariant: "decode(mux(x)) equals decode(x)" },
				},
			),
		);
		expect(decision).toMatchObject({
			supported: true,
			browserConfigs: [
				{
					role: "video-decoder",
					trackIndex: 0,
					config: {
						codec: "hvc1.1.6.L93.B0",
						codedWidth: 1_280,
						codedHeight: 720,
					},
				},
			],
		});
	});

	test("expands a bare AVC sample-entry tag to the concrete product decoder profile and level", () => {
		const bareAvcTrack = {
			type: "video",
			codec: "h264",
			nativeCodecTag: "avc1",
			profile: "High",
			level: 31,
			width: 1_280,
			height: 720,
		} as NormalizedTrack & { readonly profile: string; readonly level: number };
		const decision = decideAibrushSupport(
			request("decodeFrames", "mp4", [bareAvcTrack]),
		);

		expect(decision).toEqual({
			supported: true,
			browserConfigs: [
				{
					role: "video-decoder",
					trackIndex: 0,
					config: {
						codec: "avc1.64001F",
						codedWidth: 1_280,
						codedHeight: 720,
					},
				},
			],
		});
	});

	test("probes only the exact selected decode track, so an unsupported default track cannot veto it", () => {
		const unsupportedDefault: NormalizedTrack = {
			...VIDEO,
			codec: "hevc",
			nativeCodecTag: "hvc1.1.6.L93.B0",
			trackId: "default-hevc",
		};
		const selected: NormalizedTrack = {
			...VIDEO,
			width: 1_280,
			height: 720,
			trackId: "alternate-h264",
		};
		const decision = decideAibrushSupport(
			request("decodeFrames", "mp4", [unsupportedDefault, selected], {
				options: {
					decodeTrackSelector: {
						schema: "media-test/decode-track-selector@1",
						type: "video",
						trackIndex: 1,
						typeOrdinal: 1,
						trackId: "alternate-h264",
					},
				},
			}),
		);
		expect(decision).toEqual({
			supported: true,
			browserConfigs: [
				{
					role: "video-decoder",
					trackIndex: 1,
					config: {
						codec: "avc1.640028",
						codedWidth: 1_280,
						codedHeight: 720,
					},
				},
			],
		});
	});

	test("maps a non-default selected video to the exact public product trackSelect ordinal", () => {
		const operationRequest = request("decodeFrames", "mp4", [VIDEO, VIDEO], {
			options: { invariant: "decode-track-selection" },
		});
		const resolved = resolveAibrushDecodeTrack(
			{
				container: "mp4",
				durationSec: 1,
				tracks: [
					{
						id: 7,
						type: "video",
						codec: "h264",
						defaultDisposition: true,
						width: 1_280,
						height: 720,
					},
					{
						id: 11,
						type: "video",
						codec: "h264",
						defaultDisposition: false,
						width: 1_280,
						height: 720,
					},
					{ id: 19, type: "audio", codec: "aac" },
				],
			},
			{
				schema: "media-test/decode-track-selector@1",
				type: "video",
				trackIndex: 1,
				typeOrdinal: 1,
				trackId: "11",
			},
			operationRequest,
		);

		expect(resolved.trackSelect).toEqual(["video:1"]);
		expect(resolved.presence).toEqual({ hasVideo: true, hasAudio: false });
		expect(resolved.evidence).toMatchObject({
			type: "video",
			trackIndex: 1,
			typeOrdinal: 1,
			trackId: "11",
			codec: "h264",
		});
	});

	test("never launders an intentionally mutated input into unsupported applicability", () => {
		const malformed = request("remux", "jpeg", [], {
			outputContainer: "unknown",
			mutated: true,
		});
		expect(decideAibrushSupport(malformed)).toEqual({ supported: true });
	});

	test("admits demux scale rows through the framework packet-batch boundary", () => {
		expect(
			decideAibrushSupport(
				request("demux", "mp4", [VIDEO, AUDIO], {
					options: { invariant: "demux-scale-budgets" },
				}),
			),
		).toEqual({ supported: true });
	});

	test("emits honest first/last packet boundaries from pull-driven demux batches", async () => {
		const input = await fixtureInput("tiny_h264_360p_2s.mp4", "video/mp4");
		const operationRequest = request("demux", "mp4", [VIDEO, AUDIO], {
			scenarioId: "demux/scale-packet-batch-test",
			inputId: input.id,
			options: {
				invariant: "demux-scale-budgets",
				robustness: defineDemuxScaleContract("large"),
			},
		});
		operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
		const telemetry: OperationTelemetry[] = [];
		const operationContext: OperationContext = {
			...directContext(operationRequest),
			operationStartMs: performance.now(),
			emit: (event) => telemetry.push(event),
		};
		const engine = new AibrushMediaEngine();
		await engine.init(operationContext);
		try {
			const result = await engine.demux(input, operationContext);
			const boundaries = telemetry.filter(
				(event): event is Extract<OperationTelemetry, { type: "progress" }> =>
					event.type === "progress" && event.determinate === false,
			);
			expect(result.packets.length).toBeGreaterThan(1);
			expect(
				result.packets.every((packet) => packet.payload === undefined),
			).toBe(true);
			expect(boundaries).toHaveLength(2);
			expect(boundaries[0]!.atMs).toBeLessThanOrEqual(boundaries[1]!.atMs);
			expect(result.telemetry?.bytesRead).toBeGreaterThan(0);
		} finally {
			await engine.dispose(operationContext);
		}
	});

	test("admits declared non-media demux tracks and preserves their packet-table identity", () => {
		expect(
			decideAibrushSupport(
				request("demux", "mkv", [
					VIDEO,
					AUDIO,
					{
						type: "other",
						codec: "attachment",
					},
				]),
			),
		).toEqual({ supported: true });

		const tracks = [
			{ id: 1, mediaType: "video" as const, codec: "vp9" },
			{
				id: 2,
				mediaType: "video" as const,
				nonMedia: true as const,
				codec: "",
				language: "eng",
			},
		];
		const metadata = {
			container: "mov",
			durationSec: 1,
			tracks: tracks.map(normalizeAibrushTrack),
		};
		const result = buildAibrushDemuxResult(metadata, tracks, [
			{
				trackIndex: 1,
				size: 4,
				ptsUs: 0,
				dtsUs: 0,
				keyframe: true,
			},
		]);
		expect(result.metadata.tracks[1]).toMatchObject({
			type: "other",
			codec: "unknown",
			language: "eng",
		});
		expect(result.packets[0]).toMatchObject({
			trackIndex: 1,
			trackType: "other",
		});
		expect(result.packets[0]?.codec).toBeUndefined();
		expect(
			result.representations?.map(
				(representation) => representation.trackIndex,
			),
		).toEqual([0]);
	});

	test("admits read-side MJPEG beside media and auxiliary tracks without claiming an MJPEG encoder", () => {
		expect(
			decideAibrushSupport(
				request("demux", "mkv", [
					VIDEO,
					AUDIO,
					{ type: "other", codec: "attachment" },
					{ type: "video", codec: "mjpeg", width: 480, height: 360 },
				]),
			),
		).toEqual({ supported: true });

		expect(
			decideAibrushSupport(
				request("transcode", "mkv", [VIDEO, AUDIO], {
					outputContainer: "mkv",
					videoCodec: "mjpeg",
				}),
			),
		).toMatchObject({
			supported: false,
			reasonCode: "AIBRUSH_VIDEO_ENCODER_UNAVAILABLE",
		});
	});

	test("excludes independently identified attached pictures from remux legality", () => {
		const tracks: NormalizedTrack[] = [
			VIDEO,
			AUDIO,
			{ type: "other", codec: "" },
			{
				type: "video",
				codec: "mjpeg",
				width: 480,
				height: 360,
				fps: 90_000,
				disposition: { attached_pic: 1 },
			},
		];
		for (const container of ["mov", "mp4", "ts"]) {
			expect(
				decideAibrushSupport(
					request("remux", "mkv", tracks, { outputContainer: container }),
				),
				container,
			).toEqual({ supported: true });
		}
		expect(
			decideAibrushSupport(
				request("remux", "mkv", [
					VIDEO,
					{ type: "video", codec: "mjpeg", width: 480, height: 360 },
				], { outputContainer: "mp4" }),
			),
		).toMatchObject({
			supported: false,
			reasonCode: "AIBRUSH_CONTAINER_CODEC_ILLEGAL",
		});
	});

	test("still rejects subtitle and unknown media demux tracks", () => {
		for (const track of [
			{ type: "subtitle" as const, codec: "subrip" },
			{ type: "video" as const, codec: "theora", width: 480, height: 360 },
		]) {
			expect(
				decideAibrushSupport(request("demux", "mkv", [VIDEO, AUDIO, track])),
			).toMatchObject({
				supported: false,
				status: "NA_ENGINE",
				reasonCode: "AIBRUSH_DEMUX_TRACK_REPRESENTATION_UNSUPPORTED",
			});
		}
	});

	test("admits product-observable auxiliary MJPEG but rejects an unknown probe video codec", () => {
		expect(
			decideAibrushSupport(
				request("probe", "mkv", [
					VIDEO,
					AUDIO,
					{ type: "other", codec: "unknown" },
					{ type: "video", codec: "mjpeg", width: 480, height: 360 },
				]),
			),
		).toEqual({ supported: true });
		expect(
			decideAibrushSupport(
				request("probe", "mkv", [
					VIDEO,
					AUDIO,
					{ type: "video", codec: "theora", width: 480, height: 360 },
				]),
			),
		).toMatchObject({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_PROBE_TRACK_REPRESENTATION_UNSUPPORTED",
		});
	});

	test("rejects invalid transcode dimensions before browser config probing", () => {
		expect(
			decideAibrushSupport(
				request("transcode", "mp4", [], {
					outputContainer: "mp4",
					videoCodec: "h264",
					outputWidth: 0,
					outputHeight: 0,
					transforms: { resize: { width: 0, height: 0 } },
				}),
			),
		).toMatchObject({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_INVALID_DIMENSIONS",
		});

		const negative = request("transcode", "mp4", [VIDEO, AUDIO], {
			outputContainer: "mp4",
			videoCodec: "h264",
			outputWidth: 0,
			outputHeight: 0,
			transforms: { resize: { width: 0, height: 0 } },
		});
		negative.options = {
			...negative.options,
			robustness: {
				schema: "media-test/robustness-contract@1",
				inputClass: "negative",
				returnedOutputCheck: "media-structure",
				survivorOracles: ["graceful-failure"],
				timeoutMs: 20_000,
			},
		};
		const admitted = decideAibrushSupport(negative);
		expect(admitted).toEqual({ supported: true });
	});

	test("admits a still-image transcode only for an explicit negative rejection contract", () => {
		const stillImageTrack: NormalizedTrack = {
			type: "video",
			codec: "png",
			width: 487,
			height: 640,
			fps: 25,
		};
		const ordinary = request("transcode", "png", [stillImageTrack], {
			outputContainer: "mp4",
			videoCodec: "h264",
		});
		expect(decideAibrushSupport(ordinary)).toMatchObject({
			supported: false,
			reasonCode: "AIBRUSH_STILL_IMAGE_OPERATION_UNSUPPORTED",
		});

		const negative = { ...ordinary, options: {
			...ordinary.options,
			robustness: {
				schema: "media-test/robustness-contract@1",
				inputClass: "negative",
				returnedOutputCheck: "media-structure",
				survivorOracles: ["graceful-failure"],
				timeoutMs: 20_000,
			},
		} };
		// The odd source width would produce an unsupported H.264 encoder probe if the successful-output
		// path leaked into preflight. A negative contract must instead execute the typed rejection path.
		expect(decideAibrushSupport(negative)).toEqual({ supported: true });
	});

	test("keeps decoder probes but omits the unreachable sub-two-pixel encoder probe for a graceful boundary", () => {
		const boundary = request("transcode", "mp4", [VIDEO, AUDIO], {
			outputContainer: "mp4",
			videoCodec: "h264",
			outputWidth: 1,
			outputHeight: 1,
			transforms: { resize: { width: 1, height: 1 } },
		});
		boundary.options = { ...boundary.options, gracefulAllowOutput: true };

		const decision = decideAibrushSupport(boundary);
		expect(decision).toMatchObject({ supported: true });
		if (!decision.supported)
			throw new Error("expected the graceful boundary tuple to be supported");
		expect(decision.browserConfigs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ role: "video-decoder" }),
			]),
		);
		expect(
			decision.browserConfigs?.some((entry) => entry.role === "video-encoder"),
		).toBe(false);

		const ordinary = decideAibrushSupport({
			...boundary,
			options: { ...boundary.options, gracefulAllowOutput: false },
		});
		expect(ordinary).toMatchObject({
			supported: true,
			browserConfigs: expect.arrayContaining([
				expect.objectContaining({ role: "video-encoder" }),
			]),
		});
	});

	test("probes a dimension-valid H.264 level for 1080p output", () => {
		expect(
			decideAibrushSupport(
				request("transcode", "mp4", [VIDEO, AUDIO], {
					outputContainer: "mp4",
					videoCodec: "h264",
					outputWidth: 1_920,
					outputHeight: 1_080,
				}),
			),
		).toMatchObject({
			supported: true,
			browserConfigs: expect.arrayContaining([
				{
					role: "video-encoder",
					config: expect.objectContaining({
						codec: "avc1.42E028",
						width: 1_920,
						height: 1_080,
						framerate: 30,
					}),
				},
			]),
		});
	});

	test("probes the exact HEVC Main10 config only when 10-bit output is authored", () => {
		const depthRequest = request("transcode", "mp4", [VIDEO], {
			scenarioId: "transcode/h264_8bit_to_hevc_10bit",
			outputContainer: "mp4",
			videoCodec: "hevc",
			outputWidth: 320,
			outputHeight: 240,
			options: { video: { codec: "hevc", bitDepth: 10 } },
		});
		expect(decideAibrushSupport(depthRequest)).toMatchObject({
			supported: true,
			browserConfigs: expect.arrayContaining([
				{
					role: "video-encoder",
					config: expect.objectContaining({
						codec: "hev1.2.4.L120.B0",
						width: 320,
						height: 240,
					}),
				},
			]),
		});

		depthRequest.options = { video: { codec: "hevc", bitDepth: 8 } };
		expect(decideAibrushSupport(depthRequest)).toMatchObject({
			supported: true,
			browserConfigs: expect.arrayContaining([
				{
					role: "video-encoder",
					config: expect.objectContaining({ codec: "hvc1.1.6.L93.B0" }),
				},
			]),
		});
	});

	test("probes every ABR quality rung with its exact quantizer encoder configuration", () => {
		const variants = [
			[1_920, 1_080, 5_000_000, 6_500_000],
			[1_280, 720, 2_800_000, 3_640_000],
			[854, 480, 1_400_000, 1_820_000],
			[640, 360, 800_000, 1_040_000],
		].map(([width, height, bitrate, maxAverageBitrate]) => ({
			width,
			height,
			bitrate,
			maxAverageBitrate,
			quality: { metric: "ssim-luma-v1", minimumMean: 0.95, samples: 8 },
		}));
		const decision = decideAibrushSupport(
			request("transcode", "mp4", [VIDEO, AUDIO], {
				outputContainer: "mp4",
				videoCodec: "h264",
				options: { video: { codec: "h264" }, variants },
			}),
		);
		expect(decision).toMatchObject({ supported: true });
		if (!decision.supported) throw new Error("expected ABR support");
		expect(
			decision.browserConfigs?.filter(
				(entry) => entry.role === "video-encoder",
			),
		).toEqual([
			{
				role: "video-encoder",
				config: {
					codec: "avc1.640028",
					width: 1_920,
					height: 1_080,
					latencyMode: "quality",
					bitrateMode: "quantizer",
					framerate: 30,
				},
			},
			{
				role: "video-encoder",
				config: {
					codec: "avc1.64001F",
					width: 1_280,
					height: 720,
					latencyMode: "quality",
					bitrateMode: "quantizer",
					framerate: 30,
				},
			},
			{
				role: "video-encoder",
				config: {
					codec: "avc1.64001F",
					width: 854,
					height: 480,
					latencyMode: "quality",
					bitrateMode: "quantizer",
					framerate: 30,
				},
			},
			{
				role: "video-encoder",
				config: {
					codec: "avc1.64001E",
					width: 640,
					height: 360,
					latencyMode: "quality",
					bitrateMode: "quantizer",
					framerate: 30,
				},
			},
		]);
	});

	test("defaults implicit Opus output to 48 kHz and rejects only conflicting explicit rates", () => {
		const outputContainers = ["ogg", "webm", "mp4", "mov", "mkv"] as const;
		for (const outputContainer of outputContainers) {
			const concrete = (sourceSampleRate: number, outputSampleRate?: number) =>
				request(
					"transcode",
					"wav",
					[
						{
							type: "audio",
							codec: "pcm-s16",
							sampleRate: sourceSampleRate,
							channels: 1,
						},
					],
					{
						outputContainer,
						audioCodec: "opus",
						...(outputSampleRate !== undefined ? { outputSampleRate } : {}),
						options: {
							invariant: "transcode-audio-content",
							audio: {
								codec: "opus",
								...(outputSampleRate !== undefined
									? { sampleRate: outputSampleRate }
									: {}),
							},
						},
						...(outputSampleRate !== undefined
							? { transforms: { audio: { sampleRate: outputSampleRate } } }
							: {}),
					},
				);

			expect(decideAibrushSupport(concrete(48_000))).toMatchObject({
				supported: true,
			});
			expect(decideAibrushSupport(concrete(44_100))).toMatchObject({
				supported: true,
			});
			expect(decideAibrushSupport(concrete(44_100, 48_000))).toMatchObject({
				supported: true,
			});
			expect(decideAibrushSupport(concrete(48_000, 44_100))).toMatchObject({
				supported: false,
				status: "NA_ENGINE",
				reasonCode: "AIBRUSH_OPUS_FIXED_RATE_CONTRACT_UNSUPPORTED",
			});
		}
	});

	test("declares measured audio-content writer and decoder boundaries without hiding working codecs", () => {
		expect(
			decideAibrushSupport(
				request(
					"transcode",
					"wav",
					[
						{
							type: "audio",
							codec: "pcm-s16",
							sampleRate: 48_000,
							channels: 1,
						},
					],
					{
						outputContainer: "mp4",
						audioCodec: "aac",
						options: { invariant: "transcode-audio-content" },
					},
				),
			),
		).toMatchObject({ supported: true });

		expect(
			decideAibrushSupport(
				request(
					"transcode",
					"aac",
					[{ type: "audio", codec: "aac", sampleRate: 48_000, channels: 2 }],
					{
						scenarioId: "transcode/aac_to_pcm_wav_extract",
						outputContainer: "wav",
						audioCodec: "pcm-s16",
						options: { invariant: "transcode-audio-content" },
					},
				),
			),
		).toMatchObject({ supported: true });

		expect(
			decideAibrushSupport(
				request(
					"transcode",
					"wav",
					[
						{
							type: "audio",
							codec: "pcm-s16",
							sampleRate: 48_000,
							channels: 1,
						},
					],
					{
						outputContainer: "ogg",
						audioCodec: "vorbis",
						options: { invariant: "transcode-audio-content" },
					},
				),
			),
		).toEqual({ supported: true });
		expect(
			decideAibrushSupport(
				request(
					"transcode",
					"wav",
					[
						{
							type: "audio",
							codec: "pcm-s16",
							sampleRate: 48_000,
							channels: 1,
						},
					],
					{
						outputContainer: "flac",
						audioCodec: "flac",
						options: { invariant: "transcode-audio-content" },
					},
				),
			),
		).toEqual({ supported: true });
	});

	test("declares only lossy audio copy trims without exact presentation timing NA", () => {
		for (const [container, codec] of [
			["mp4", "aac"],
			["adts", "aac"],
		] as const) {
			expect(
				decideAibrushSupport(
					request(
						"trim",
						container,
						[
							{
								type: "audio",
								codec,
								sampleRate: 48_000,
								channels: 2,
							},
						],
						{
							outputContainer: container,
							options: { invariant: "trim-audio-content" },
						},
					),
				),
			).toEqual({
				supported: false,
				status: "NA_ENGINE",
				reasonCode: "AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED",
				reason:
					"the packet-copy trim surface cannot author the exact decoded presentation window outside same-container Ogg Opus granule or MP3 Xing/LAME authoring",
			});
		}

		expect(
			decideAibrushSupport(
				request(
					"trim",
					"mp3",
					[
						{
							type: "audio",
							codec: "mp3",
							sampleRate: 44_100,
							channels: 2,
						},
					],
					{
						outputContainer: "mp3",
						audioCodec: "mp3",
						options: { invariant: "trim-audio-content" },
					},
				),
			),
		).toEqual({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_MP3_EXACT_TRIM_UNSUPPORTED",
			reason:
				"MP3 packet copy cannot reconstruct the source decoder state within the 4095-sample Xing/LAME delay limit, so the exact decoded PCM boundaries are not authorable",
		});

		expect(
			decideAibrushSupport(
				request(
					"trim",
					"ogg",
					[
						{
							type: "audio",
							codec: "opus",
							sampleRate: 48_000,
							channels: 2,
						},
					],
					{
						outputContainer: "ogg",
						audioCodec: "opus",
						options: { invariant: "trim-audio-content" },
					},
				),
			),
		).toEqual({ supported: true });

		expect(
			decideAibrushSupport(
				request(
					"trim",
					"flac",
					[
						{
							type: "audio",
							codec: "flac",
							sampleRate: 48_000,
							channels: 2,
						},
					],
					{
						outputContainer: "flac",
						options: { invariant: "trim-audio-content" },
					},
				),
			),
		).toEqual({ supported: true });
	});

	test("keeps ADTS AAC packet-copy trim NA when whole access units cannot express the decoded window", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/aac_adts.aac").arrayBuffer(),
		);
		const input = rangeBackedInput("aac_adts.aac", "audio/aac", bytes);
		const range = { startUs: 2_000_000, endUs: 7_000_000 };
		const operationRequest = request(
			"trim",
			"adts",
			[
				{
					type: "audio",
					codec: "aac",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				inputId: input.id,
				outputContainer: "adts",
				audioCodec: "aac",
				options: {
					container: "adts",
					frameAccurate: false,
					invariant: "trim-audio-content",
					range,
				},
				transforms: {
					trim: {
						...range,
						frameAccurate: false,
					},
				},
			},
		);
		expect(decideAibrushSupport(operationRequest)).toEqual({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_AUDIO_PRESENTATION_TIMING_UNSUPPORTED",
			reason:
				"the packet-copy trim surface cannot author the exact decoded presentation window outside same-container Ogg Opus granule or MP3 Xing/LAME authoring",
		});

		const fetchDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"fetch",
		);
		installRangeFetch(bytes);
		const context = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(context);
			const output = await engine.trim(
				input,
				range,
				{
					container: "adts",
					frameAccurate: false,
				},
				context,
			);
			const inspected = inspectTrimAudioContainer(output.bytes, "adts");
			expect(inspected).toEqual({
				state: "OK",
				value: {
					container: "adts",
					codec: "aac",
					sampleRate: 48_000,
					channels: 2,
					codedSampleFrames: 241_664,
					presentationSampleFrames: 241_664,
					primingSampleFrames: 0,
					endTrimSampleFrames: 0,
					precision: "exact",
					packetOrFrameCount: 236,
				},
			});
			if (inspected.state !== "OK") throw new Error(inspected.detail);
			expect(inspected.value.presentationSampleFrames).not.toBe(
				((range.endUs - range.startUs) * inspected.value.sampleRate) /
					1_000_000,
			);
			expect(engine.configUsed).toMatchObject({
				operation: "trim",
				route: "framework.trim",
			});
		} finally {
			await engine.dispose(context);
			restoreGlobal("fetch", fetchDescriptor);
		}
	});

	test("keeps exact MP3 copy trim NA after auditing the Xing/LAME preroll limit", async () => {
		const range = { startUs: 5_000_000, endUs: 10_000_000 };
		const operationRequest = request(
			"trim",
			"mp3",
			[
				{
					type: "audio",
					codec: "mp3",
					sampleRate: 44_100,
					channels: 2,
				},
			],
			{
				inputId: "mp3_xing.mp3",
				outputContainer: "mp3",
				audioCodec: "mp3",
				options: {
					container: "mp3",
					frameAccurate: false,
					invariant: "trim-audio-content",
					range,
				},
				transforms: {
					trim: {
						...range,
						frameAccurate: false,
					},
				},
			},
		);
		expect(decideAibrushSupport(operationRequest)).toEqual({
			supported: false,
			status: "NA_ENGINE",
			reasonCode: "AIBRUSH_MP3_EXACT_TRIM_UNSUPPORTED",
			reason:
				"MP3 packet copy cannot reconstruct the source decoder state within the 4095-sample Xing/LAME delay limit, so the exact decoded PCM boundaries are not authorable",
		});

		for (const file of ["02.mp3", "03.mp3", "mp3_xing.mp3"]) {
			const bytes = new Uint8Array(
				await Bun.file(
					`fixtures/media/scenarios/trim/audio_mp3_copy/${file}`,
				).arrayBuffer(),
			);
			const inspected = inspectTrimAudioContainer(bytes, "mp3");
			expect(inspected.state).toBe("OK");
			if (inspected.state !== "OK") throw new Error(inspected.detail);
			expect(inspected.value.precision).toBe("exact");
			const samplesPerFrame =
				inspected.value.codedSampleFrames / inspected.value.packetOrFrameCount;
			expect(samplesPerFrame).toBe(1_152);
			const requestedCodedStart =
				inspected.value.primingSampleFrames + 5 * inspected.value.sampleRate;
			const intraFrameLeading = requestedCodedStart % samplesPerFrame;
			const maximumLegalPreroll = Math.floor(
				(0xfff - intraFrameLeading) / samplesPerFrame,
			);
			expect(maximumLegalPreroll).toBe(2);
			expect(
				intraFrameLeading + (maximumLegalPreroll + 1) * samplesPerFrame,
			).toBeGreaterThan(0xfff);
		}
	});

	test("authors an exact decoded Ogg Opus copy-trim window through the framework route", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/opus.ogg").arrayBuffer(),
		);
		const input = rangeBackedInput("opus.ogg", "audio/ogg", bytes);
		const range = { startUs: 2_000_000, endUs: 7_000_000 };
		const operationRequest = request(
			"trim",
			"ogg",
			[
				{
					type: "audio",
					codec: "opus",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				inputId: input.id,
				outputContainer: "ogg",
				audioCodec: "opus",
				options: {
					container: "ogg",
					frameAccurate: false,
					invariant: "trim-audio-content",
					range,
				},
				transforms: {
					trim: {
						...range,
						frameAccurate: false,
					},
				},
			},
		);
		expect(decideAibrushSupport(operationRequest)).toEqual({ supported: true });

		const fetchDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"fetch",
		);
		installRangeFetch(bytes);
		const context = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(context);
			const output = await engine.trim(
				input,
				range,
				{
					container: "ogg",
					frameAccurate: false,
				},
				context,
			);
			expect(inspectTrimAudioContainer(output.bytes, "ogg")).toEqual({
				state: "OK",
				value: {
					container: "ogg",
					codec: "opus",
					sampleRate: 48_000,
					channels: 2,
					codedSampleFrames: 305_280,
					presentationSampleFrames: 240_000,
					primingSampleFrames: 64_632,
					endTrimSampleFrames: 648,
					precision: "exact",
					packetOrFrameCount: 318,
					metadataTotalSampleFrames: 240_000,
					endOfStreamPresent: true,
				},
			});
			expect(engine.configUsed).toMatchObject({
				operation: "trim",
				route: "framework.trim",
			});
		} finally {
			await engine.dispose(context);
			restoreGlobal("fetch", fetchDescriptor);
		}
	});

	test("admits the measured robustness trim composition contracts", () => {
		for (const scenarioId of [
			"robustness/prop_trim_additivity_compose",
			"robustness/prop_trim_concatenation",
		]) {
			expect(
				decideAibrushSupport(
					request("trim", "mp4", [VIDEO, AUDIO], {
						scenarioId,
						outputContainer: "mp4",
						options: { invariant: "trim(a..b)++trim(b..c)==trim(a..c)" },
					}),
				),
			).toEqual({ supported: true });
		}

		expect(
			decideAibrushSupport(
				request("trim", "mp4", [VIDEO, AUDIO], {
					scenarioId: "robustness/edge_trim_zero_length",
					outputContainer: "mp4",
					options: { invariant: "trim(a..b)++trim(b..c)==trim(a..c)" },
				}),
			),
		).toMatchObject({ supported: true });
	});

	test("admits the PCM-native stereo-to-5.1 authored matrix", () => {
		const upmix = request(
			"transcode",
			"wav",
			[
				{
					type: "audio",
					codec: "pcm-s16",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				scenarioId: "audio-dsp/upmix_stereo_to_5_1",
				outputContainer: "wav",
				audioCodec: "pcm-s16",
				options: {
					invariant: "audio-dsp-transform",
					audio: {
						codec: "pcm-s16",
						channels: 6,
						mixMatrix: [
							[1, 0],
							[0, 1],
							[Math.SQRT1_2, Math.SQRT1_2],
							[0, 0],
							[Math.SQRT1_2, 0],
							[0, Math.SQRT1_2],
						],
					},
				},
			},
		);
		upmix.output!.channels = 6;
		expect(decideAibrushSupport(upmix)).toEqual({ supported: true });

		upmix.scenarioId = "audio-dsp/upmix_mono_to_stereo";
		upmix.output!.channels = 2;
		expect(decideAibrushSupport(upmix)).toEqual({ supported: true });

		upmix.scenarioId = "audio-dsp/upmix_stereo_to_5_1";
		upmix.output!.channels = 6;
		upmix.inputs[0]!.mutated = true;
		expect(decideAibrushSupport(upmix)).toEqual({ supported: true });
	});

	test("forwards every authored stereo-to-5.1 coefficient without normalization", () => {
		const matrix = [
			[1, 0],
			[0, 1],
			[Math.SQRT1_2, Math.SQRT1_2],
			[0, 0],
			[Math.SQRT1_2, 0],
			[0, Math.SQRT1_2],
		] as const;
		const target = mapAibrushTranscodeAudioTarget({
			codec: "pcm-s16",
			channels: 6,
			mixMatrix: matrix,
		} as TranscodeAudioOptions);
		expect(target).toEqual({
			codec: "pcm-s16",
			channels: 6,
			mixMatrix: matrix,
		});
		expect(target.mixMatrix).toBe(matrix);

		const mutated = matrix.map((row) => [...row]);
		mutated[2]![0] = 0.5;
		expect(
			mapAibrushTranscodeAudioTarget({
				codec: "pcm-s16",
				channels: 6,
				mixMatrix: mutated,
			} as TranscodeAudioOptions).mixMatrix?.[2]?.[0],
		).toBe(0.5);
	});

	test("negative headers and a canonical zero-frame WAV reject through typed structural paths", async () => {
		for (const [scenarioId, filename, container, mime] of [
			[
				"audio-dsp/fuzz_aiff_header_truncated_probe",
				"aiff_header_truncated.aiff",
				"aiff",
				"application/octet-stream",
			],
			[
				"audio-dsp/fuzz_wav_header_truncated_probe",
				"wav_header_truncated.wav",
				"wav",
				"audio/wav",
			],
		] as const) {
			const input = await fixtureInput(filename, mime);
			const operationRequest = request("probe", container, [], {
				scenarioId,
				inputId: filename,
				options: {
					robustness: {
						schema: "media-test/robustness-contract@1",
						inputClass: "negative",
						returnedOutputCheck: "probe-structure",
						survivorOracles: ["graceful-failure"],
						timeoutMs: 15_000,
					},
				},
			});
			operationRequest.inputs[0]!.sourceEvidence = "UNRESOLVED";
			operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
			const operationContext = directContext(operationRequest);
			const engine = new AibrushMediaEngine();
			await engine.init(operationContext);
			try {
				let thrown: unknown;
				try {
					await engine.probe(input, operationContext);
				} catch (error) {
					thrown = error;
				}
				expect(isMalformedInputError(thrown)).toBe(true);
				expect(thrown).toMatchObject({
					reasonCode: "AIBRUSH_REQUEST_REJECTED",
					operation: "probe",
					stage: "validate",
				});
				if (container === "wav") {
					expect(engine.configUsed).toMatchObject({
						route: "wav.probe-header",
						operation: "probe",
					});
				}
			} finally {
				await engine.dispose(operationContext);
			}
		}

		const emptyInput = await fixtureInput("empty_audio.wav", "audio/wav");
		const emptyRequest = request("transcode", "wav", [], {
			scenarioId: "audio-dsp/canonical_empty_wav_identity",
			inputId: "empty_audio.wav",
			outputContainer: "wav",
			audioCodec: "pcm-s16",
			options: {
				container: "wav",
				audio: { codec: "pcm-s16", sampleRate: 44_100 },
				gracefulAllowOutput: true,
			},
		});
		const emptyContext = directContext(emptyRequest);
		const emptyEngine = new AibrushMediaEngine();
		await emptyEngine.init(emptyContext);
		try {
			let thrown: unknown;
			try {
				await emptyEngine.transcode(
					emptyInput,
					{ container: "wav", audio: { codec: "pcm-s16", sampleRate: 44_100 } },
					emptyContext,
				);
			} catch (error) {
				thrown = error;
			}
			expect(isMalformedInputError(thrown)).toBe(true);
			expect(thrown).toMatchObject({
				reasonCode: "AIBRUSH_REQUEST_REJECTED",
				operation: "transcode",
				stage: "validate",
				reason: "zero-frame WAV has no PCM samples to transform",
			});
			expect(emptyEngine.configUsed).toMatchObject({
				route: "wav.rewrite-empty-pcm",
				operation: "transcode",
			});
		} finally {
			await emptyEngine.dispose(emptyContext);
		}

		const ordinary = await fixtureInput("wav_s16.wav", "audio/wav");
		const malformedBytes = new Uint8Array(await ordinary.arrayBuffer());
		malformedBytes.fill(0, 16, Math.min(36, malformedBytes.byteLength));
		const malformedInput: MediaInput = {
			...ordinary,
			id: "input.wav",
			sizeBytes: malformedBytes.byteLength,
			blob: () =>
				Promise.resolve(
					new Blob([malformedBytes.slice().buffer], { type: "audio/wav" }),
				),
			arrayBuffer: () => Promise.resolve(malformedBytes.slice().buffer),
		};
		const malformedRequest = request(
			"transcode",
			"wav",
			[
				{
					type: "audio",
					codec: "pcm-s16",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				scenarioId: "audio-dsp/general_pcm_structural_rejection",
				inputId: "input.wav",
				outputContainer: "wav",
				audioCodec: "pcm-s16",
				options: {
					container: "wav",
					audio: { codec: "pcm-s16", channels: 1 },
					robustness: {
						schema: "media-test/robustness-contract@1",
						inputClass: "negative",
						returnedOutputCheck: "media-structure",
						survivorOracles: ["graceful-failure"],
						timeoutMs: 15_000,
					},
				},
			},
		);
		malformedRequest.inputs[0]!.sizeBytes = malformedInput.sizeBytes;
		const malformedContext = directContext(malformedRequest);
		const malformedEngine = new AibrushMediaEngine();
		await malformedEngine.init(malformedContext);
		try {
			let thrown: unknown;
			try {
				await malformedEngine.transcode(
					malformedInput,
					{ container: "wav", audio: { codec: "pcm-s16", channels: 1 } },
					malformedContext,
				);
			} catch (error) {
				thrown = error;
			}
			expect(isMalformedInputError(thrown)).toBe(true);
			expect(thrown).toMatchObject({
				reasonCode: "AIBRUSH_REQUEST_REJECTED",
				operation: "transcode",
				stage: "validate",
				reason: "WAVE file has no fmt chunk",
			});
			expect(malformedEngine.configUsed).toMatchObject({
				route: "wav.reject-invalid-pcm",
				operation: "transcode",
			});
		} finally {
			await malformedEngine.dispose(malformedContext);
		}
	});

	test("ordinary and metadata-heavy WAV probes use adaptive bounded header ranges", async () => {
		const ordinary = new Uint8Array(
			await Bun.file("fixtures/media/wav_s24.wav").arrayBuffer(),
		);
		const metadataHeavy = insertWavJunkBeforeData(ordinary, 5_000);

		for (const [label, bytes, expectedRanges] of [
			["ordinary", ordinary, ["bytes=0-4095"]],
			["metadata-heavy", metadataHeavy, ["bytes=0-4095", "bytes=0-65535"]],
		] as const) {
			const fetchDescriptor = Object.getOwnPropertyDescriptor(
				globalThis,
				"fetch",
			);
			const observedRanges: string[] = [];
			Object.defineProperty(globalThis, "fetch", {
				configurable: true,
				writable: true,
				value: async (
					_resource: RequestInfo | URL,
					init?: RequestInit,
				): Promise<Response> => {
					const range = new Headers(init?.headers).get("Range");
					if (range === null)
						throw new Error(`${label}: expected a bounded Range request`);
					observedRanges.push(range);
					const match = /^bytes=0-(\d+)$/.exec(range);
					if (match === null)
						throw new Error(`${label}: unexpected Range '${range}'`);
					const requestedEnd = Number(match[1]);
					const end = Math.min(bytes.byteLength - 1, requestedEnd);
					const body = bytes.slice(0, end + 1);
					return new Response(body, {
						status: 206,
						headers: {
							"Content-Length": String(body.byteLength),
							"Content-Range": `bytes 0-${end}/${bytes.byteLength}`,
						},
					});
				},
			});

			const input: MediaInput = {
				id: `${label}.wav`,
				url: `http://127.0.0.1:5151/${label}.wav`,
				mime: "audio/wav",
				mutated: false,
				sizeBytes: bytes.byteLength,
				blob: () =>
					Promise.resolve(
						new Blob([bytes.slice().buffer], { type: "audio/wav" }),
					),
				arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
			};
			const operationRequest = request(
				"probe",
				"wav",
				[{ type: "audio", codec: "pcm-s24", sampleRate: 48_000, channels: 2 }],
				{
					scenarioId: "audio-dsp/general_bounded_wav_header_probe",
					inputId: input.id,
				},
			);
			operationRequest.inputs[0]!.sizeBytes = bytes.byteLength;
			const operationContext = directContext(operationRequest);
			const engine = new AibrushMediaEngine();
			try {
				await engine.init(operationContext);
				const metadata = await engine.probe(input, operationContext);
				expect(metadata, label).toMatchObject({
					container: "wav",
					tracks: [
						{
							type: "audio",
							codec: "pcm-s24",
							sampleRate: 48_000,
							channels: 2,
						},
					],
					probeEvidence: { readMode: "range" },
				});
				expect(engine.configUsed, label).toMatchObject({
					route: "wav.probe-header",
					operation: "probe",
				});
				expect(observedRanges, label).toEqual(expectedRanges);
			} finally {
				await engine.dispose(operationContext);
				restoreGlobal("fetch", fetchDescriptor);
			}
		}
	});

	test("bounded audio-only WAV decode uses one capped PCM-prefix read", async () => {
		const bytes = new Uint8Array(
			await Bun.file("fixtures/media/wav_s24.wav").arrayBuffer(),
		);
		const maxFrames = 4_096;
		const channels = 2;
		const decodeReadBytes = 64 * 1_024;
		const expectedRanges = [`bytes=0-${decodeReadBytes - 1}`];
		const observedRanges: string[] = [];
		let arrayBufferReads = 0;
		const fetchDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"fetch",
		);
		Object.defineProperty(globalThis, "fetch", {
			configurable: true,
			writable: true,
			value: async (
				_resource: RequestInfo | URL,
				init?: RequestInit,
			): Promise<Response> => {
				const range = new Headers(init?.headers).get("Range");
				if (range === null) throw new Error("expected a bounded Range request");
				observedRanges.push(range);
				const match = /^bytes=0-(\d+)$/.exec(range);
				if (match === null) throw new Error(`unexpected Range '${range}'`);
				const requestedEnd = Number(match[1]);
				const end = Math.min(bytes.byteLength - 1, requestedEnd);
				const body = bytes.slice(0, end + 1);
				return new Response(body, {
					status: 206,
					headers: {
						"Content-Length": String(body.byteLength),
						"Content-Range": `bytes 0-${end}/${bytes.byteLength}`,
					},
				});
			},
		});
		const input: MediaInput = {
			id: "ordinary_pcm.wav",
			url: "http://127.0.0.1:5151/ordinary_pcm.wav",
			mime: "audio/wav",
			mutated: false,
			sizeBytes: bytes.byteLength,
			blob: () =>
				Promise.resolve(
					new Blob([bytes.slice().buffer], { type: "audio/wav" }),
				),
			arrayBuffer: () => {
				arrayBufferReads++;
				return Promise.resolve(bytes.slice().buffer);
			},
		};
		const operationRequest = request(
			"decodeFrames",
			"wav",
			[
				{
					type: "audio",
					codec: "pcm-s24",
					sampleRate: 48_000,
					channels,
				},
			],
			{
				scenarioId: "audio-dsp/canonical_pcm_prefix_decode",
				inputId: "ordinary_pcm.wav",
				options: { maxFrames },
			},
		);
		operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
		const operationContext = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(operationContext);
			const sink = await engine.decodeFrames(
				input,
				{ maxFrames },
				operationContext,
			);
			expect(sink.frames).toHaveLength(maxFrames);
			expect(sink.frames[0]?.index).toBe(0);
			expect(sink.frames.at(-1)?.index).toBe(maxFrames - 1);
			expect(
				sink.frames.every((frame) => frame.width === 2 && frame.height === 1),
			).toBe(true);
			expect(
				sink.frames.every((frame) => /^[0-9a-f]{64}$/.test(frame.sha256)),
			).toBe(true);
			expect(observedRanges).toEqual(expectedRanges);
			expect(arrayBufferReads).toBe(0);
			expect(engine.configUsed).toMatchObject({
				route: "wav.decode-pcm-prefix",
				operation: "decodeFrames",
			});
		} finally {
			await engine.dispose(operationContext);
			restoreGlobal("fetch", fetchDescriptor);
		}
	});

	test("dense ISO-BMFF decode uses the product packet plan and owned RGBA views", async () => {
		const videoDecoderDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"VideoDecoder",
		);
		const encodedChunkDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"EncodedVideoChunk",
		);
		const imageDataDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"ImageData",
		);
		const configured: VideoDecoderConfig[] = [];
		let copiedIntoClampedArray = false;

		class FakeFrame {
			readonly codedWidth = 320;
			readonly codedHeight = 240;
			readonly displayWidth = 320;
			readonly displayHeight = 240;
			readonly visibleRect = { x: 0, y: 0, width: 320, height: 240 };

			constructor(readonly timestamp: number) {}

			async copyTo(
				destination: AllowSharedBufferSource,
			): Promise<PlaneLayout[]> {
				copiedIntoClampedArray ||= destination instanceof Uint8ClampedArray;
				const bytes = ArrayBuffer.isView(destination)
					? new Uint8Array(
							destination.buffer,
							destination.byteOffset,
							destination.byteLength,
						)
					: new Uint8Array(destination);
				bytes.fill(this.timestamp & 0xff);
				return [{ offset: 0, stride: this.codedWidth * 4 }];
			}

			close(): void {}
		}

		class FakeChunk {
			readonly type: EncodedVideoChunkType;
			readonly timestamp: number;
			readonly duration: number | null;

			constructor(init: EncodedVideoChunkInit) {
				this.type = init.type;
				this.timestamp = init.timestamp;
				this.duration = init.duration ?? null;
			}
		}

		class FakeDecoder {
			state: CodecState = "unconfigured";
			readonly #queued: FakeChunk[] = [];

			constructor(private readonly callbacks: VideoDecoderInit) {}

			configure(config: VideoDecoderConfig): void {
				configured.push(config);
				this.state = "configured";
			}

			decode(chunk: EncodedVideoChunk): void {
				this.#queued.push(chunk as unknown as FakeChunk);
			}

			async flush(): Promise<void> {
				for (const chunk of this.#queued.splice(0)) {
					this.callbacks.output(
						new FakeFrame(chunk.timestamp) as unknown as VideoFrame,
					);
				}
			}

			close(): void {
				this.state = "closed";
			}
		}

		class FakeImageData {
			constructor(
				readonly data: Uint8ClampedArray,
				readonly width: number,
				readonly height: number,
			) {}
		}

		Object.defineProperty(globalThis, "VideoDecoder", {
			configurable: true,
			writable: true,
			value: FakeDecoder,
		});
		Object.defineProperty(globalThis, "EncodedVideoChunk", {
			configurable: true,
			writable: true,
			value: FakeChunk,
		});
		Object.defineProperty(globalThis, "ImageData", {
			configurable: true,
			writable: true,
			value: FakeImageData,
		});

		const input = await fixtureInput("video_240fps.mp4", "video/mp4");
		const operationRequest = request(
			"decodeFrames",
			"mp4",
			[
				{
					type: "video",
					codec: "h264",
					width: 320,
					height: 240,
					fps: 240,
				},
			],
			{
				scenarioId: "decode-seek/general_dense_h264_prefix",
				inputId: "ordinary-high-rate.mp4",
				options: { maxFrames: 240 },
			},
		);
		operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
		const operationContext = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		try {
			await engine.init(operationContext);
			const sink = await engine.decodeFrames(
				input,
				{ maxFrames: 240 },
				operationContext,
			);
			expect(sink.frames).toHaveLength(240);
			expect(sink.frames.map((frame) => frame.index)).toEqual(
				Array.from({ length: 240 }, (_, index) => index),
			);
			expect(
				sink.frames.every((frame) => /^[0-9a-f]{64}$/.test(frame.sha256)),
			).toBe(true);
			const expectedFirstFrame = new Uint8Array(320 * 240 * 4);
			expectedFirstFrame.fill(sink.frames[0]!.ptsUs & 0xff);
			expect(sink.frames[0]!.sha256).toBe(await sha256Hex(expectedFirstFrame));
			expect(copiedIntoClampedArray).toBe(true);
			expect(configured[0]).toMatchObject({
				codec: "avc1.64001F",
				codedWidth: 320,
				codedHeight: 240,
				hardwareAcceleration: "no-preference",
			});
			expect(engine.configUsed).toMatchObject({
				route: "core.iso-bmff-packet-info+webcodecs",
				operation: "decodeFrames",
				codecConfigs: [
					{
						role: "video-decoder",
						codec: "avc1.64001F",
						codedWidth: 320,
						codedHeight: 240,
						hardwareAcceleration: "no-preference",
						descriptionByteLength: 44,
					},
				],
			});
		} finally {
			await engine.dispose(operationContext);
			restoreGlobal("VideoDecoder", videoDecoderDescriptor);
			restoreGlobal("EncodedVideoChunk", encodedChunkDescriptor);
			restoreGlobal("ImageData", imageDataDescriptor);
		}
	});

	test("same-layout WAV transcode consumes one owned snapshot without a second output copy", async () => {
		const input = await fixtureInput("wav_s16.wav", "audio/wav");
		const expected = new Uint8Array(await input.arrayBuffer());
		const operationRequest = request(
			"transcode",
			"wav",
			[
				{
					type: "audio",
					codec: "pcm-s16",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				scenarioId: "audio-dsp/general_identity_pcm_transform",
				inputId: "ordinary.wav",
				outputContainer: "wav",
				audioCodec: "pcm-s16",
				options: {
					container: "wav",
					audio: { codec: "pcm-s16", sampleRate: 48_000, channels: 2 },
					invariant: "audio-dsp-transform",
				},
			},
		);
		operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
		const operationContext = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		await engine.init(operationContext);
		try {
			const output = await engine.transcode(
				input,
				{
					container: "wav",
					audio: { codec: "pcm-s16", sampleRate: 48_000, channels: 2 },
				},
				operationContext,
			);
			expect(output.bytes).toEqual(expected);
			expect(engine.configUsed).toMatchObject({
				route: "wav.rewrite-owned-pcm-copy",
				operation: "transcode",
			});
		} finally {
			await engine.dispose(operationContext);
		}
	});

	test("PCM endianness roundtrip exposes a real big-endian AIFF leg and derives the final WAV from it", async () => {
		const input = await fixtureInput("wav_s16.wav", "audio/wav");
		const expected = new Uint8Array(await input.arrayBuffer());
		const operationRequest = request(
			"transcode",
			"wav",
			[
				{
					type: "audio",
					codec: "pcm-s16",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				scenarioId: "audio-dsp/general_pcm_endianness_roundtrip",
				inputId: "ordinary.wav",
				outputContainer: "wav",
				audioCodec: "pcm-s16",
				options: {
					container: "wav",
					audio: { codec: "pcm-s16", roundtrip: "pcm-s16be" },
					invariant: "audio-dsp-endianness-roundtrip",
				},
			},
		);
		operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
		const operationContext = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		await engine.init(operationContext);
		try {
			const output = await engine.transcode(
				input,
				{
					container: "wav",
					audio: {
						codec: "pcm-s16",
						roundtrip: "pcm-s16be",
					} as TranscodeAudioOptions & { roundtrip: string },
				},
				operationContext,
			);
			const intermediate = output.intermediates?.find(
				(item) => item.role === "audio-dsp-roundtrip-leg-1",
			);
			expect(intermediate).toBeDefined();
			expect(intermediate?.container).toBe("aiff");
			expect(new TextDecoder().decode(intermediate?.bytes.subarray(0, 4))).toBe(
				"FORM",
			);
			expect(
				new TextDecoder().decode(intermediate?.bytes.subarray(8, 12)),
			).toBe("AIFF");
			expect(output.bytes).toEqual(expected);
			expect(engine.configUsed).toMatchObject({
				route: "core.wav-aiff-wav-pcm-roundtrip",
				operation: "transcode",
			});
		} finally {
			await engine.dispose(operationContext);
		}
	});

	test("explicit WAV PCM quantization uses the direct format converter and honors floor truncation", async () => {
		const input = await fixtureInput("wav_s24.wav", "audio/wav");
		const sourceBytes = new Uint8Array(await input.arrayBuffer());
		const operationRequest = request(
			"transcode",
			"wav",
			[
				{
					type: "audio",
					codec: "pcm-s24",
					sampleRate: 48_000,
					channels: 2,
				},
			],
			{
				scenarioId: "audio-dsp/general_pcm_floor_reduction",
				inputId: "ordinary-s24.wav",
				outputContainer: "wav",
				audioCodec: "pcm-s16",
				options: {
					container: "wav",
					audio: {
						codec: "pcm-s16",
						quantization: {
							dither: "none",
							rounding: "truncate-toward-negative-infinity",
							clipping: "saturate",
						},
					},
					invariant: "audio-dsp-transform",
				},
			},
		);
		operationRequest.inputs[0]!.sizeBytes = input.sizeBytes;
		const operationContext = directContext(operationRequest);
		const engine = new AibrushMediaEngine();
		await engine.init(operationContext);
		try {
			const output = await engine.transcode(
				input,
				{
					container: "wav",
					audio: {
						codec: "pcm-s16",
						quantization: {
							dither: "none",
							rounding: "truncate-toward-negative-infinity",
							clipping: "saturate",
						},
					} as TranscodeAudioOptions & {
						quantization: {
							dither: "none";
							rounding: "truncate-toward-negative-infinity";
							clipping: "saturate";
						};
					},
				},
				operationContext,
			);
			const source = decodeNativePcm(sourceBytes, { maxFrames: 2_048 });
			const converted = decodeNativePcm(output.bytes, { maxFrames: 2_048 });
			expect(source.state).toBe("OK");
			expect(converted.state).toBe("OK");
			if (source.state !== "OK" || converted.state !== "OK") return;
			expect(converted.value).toMatchObject({
				codec: "pcm-s16",
				sampleRate: source.value.sampleRate,
				channels: source.value.channels,
				decodedSampleFrames: source.value.decodedSampleFrames,
			});
			for (let index = 0; index < source.value.samples.length; index++) {
				const sourceCode = Math.round(
					(source.value.samples[index] as number) * 8_388_608,
				);
				expect(converted.value.samples[index]).toBe(
					Math.floor(sourceCode / 256) / 32_768,
				);
			}
			expect(engine.configUsed).toMatchObject({
				route: "core.wav-pcm-format-convert",
				operation: "transcode",
			});
		} finally {
			await engine.dispose(operationContext);
		}
	});

	test("keeps alpha and roundtrip routes generally applicable without source-identity policy", () => {
		for (const [scenarioId, codec] of [
			["transcode/vp9_alpha_to_vp8_keepalpha", "vp8"],
			["transcode/vp9_alpha_to_vp9_keepalpha", "vp9"],
		] as const) {
			expect(
				decideAibrushSupport(
					request("transcode", "webm", [{ type: "video", codec: "vp9" }], {
						scenarioId,
						outputContainer: "webm",
						videoCodec: codec,
						options: { alpha: "keep", invariant: "transcode-effect-aware" },
					}),
				),
			).toMatchObject({ supported: true });
		}

		const opaqueLetterbox = request(
			"transcode",
			"webm",
			[{ type: "video", codec: "vp9" }],
			{
				scenarioId: "transcode/h264_pad_letterbox_4x3_to_16x9",
				inputId: "vp9_alpha.webm",
				outputContainer: "mp4",
				videoCodec: "h264",
				options: {
					video: { codec: "h264", width: 1_280, height: 720 },
					pad: { width: 1_280, height: 720, color: "black" },
					invariant: "transcode-effect-aware",
				},
			},
		);
		expect(decideAibrushSupport(opaqueLetterbox)).toMatchObject({ supported: true });
		opaqueLetterbox.inputs[0]!.id = "opaque-vp9.webm";
		expect(decideAibrushSupport(opaqueLetterbox)).toMatchObject({
			supported: true,
		});

		const exactRoundtrip = request("transcode", "mp4", [VIDEO, AUDIO], {
			scenarioId: "transcode/roundtrip_leg1_h264_to_vp9",
			inputId: "scenarios/transcode/roundtrip_leg1_h264_to_vp9/03.mp4",
			outputContainer: "webm",
			videoCodec: "vp9",
			audioCodec: "opus",
		});
		expect(decideAibrushSupport(exactRoundtrip)).toMatchObject({
			supported: true,
		});
		exactRoundtrip.inputs[0]!.id =
			"scenarios/transcode/roundtrip_leg1_h264_to_vp9/02.mp4";
		expect(decideAibrushSupport(exactRoundtrip)).toMatchObject({
			supported: true,
		});
	});

	test("does not classify transcode quality from scenario or input identities", () => {
		const rows: Array<{
			scenarioId: string;
			inputId: string;
			inputContainer: string;
			tracks: NormalizedTrack[];
			outputContainer: string;
			videoCodec?: string;
			audioCodec?: string;
			options?: Record<string, unknown>;
		}> = [
			{
				scenarioId: "transcode/h264_two_pass_bitrate",
				inputId: "scenarios/transcode/h264_two_pass_bitrate/02.mp4",
				inputContainer: "mp4",
				tracks: [VIDEO, AUDIO],
				outputContainer: "mp4",
				videoCodec: "h264",
				options: { video: { codec: "h264", bitrate: 2_000_000, passes: 2 } },
			},
			{
				scenarioId: "transcode/h264_two_pass_bitrate",
				inputId: "scenarios/transcode/h264_two_pass_bitrate/03.mp4",
				inputContainer: "mp4",
				tracks: [VIDEO, AUDIO],
				outputContainer: "mp4",
				videoCodec: "h264",
				options: { video: { codec: "h264", bitrate: 2_000_000, passes: 2 } },
			},
			{
				scenarioId: "transcode/fanout_h264_abr_ladder",
				inputId: "scenarios/transcode/fanout_h264_abr_ladder/02.mp4",
				inputContainer: "mp4",
				tracks: [VIDEO, AUDIO],
				outputContainer: "mp4",
				videoCodec: "h264",
			},
			{
				scenarioId: "transcode/fanout_h264_abr_ladder",
				inputId: "scenarios/transcode/fanout_h264_abr_ladder/03.mp4",
				inputContainer: "mp4",
				tracks: [VIDEO, AUDIO],
				outputContainer: "mp4",
				videoCodec: "h264",
			},
			{
				scenarioId: "transcode/vp9_to_vp8_webm",
				inputId: "scenarios/transcode/vp9_to_vp8_webm/01.webm",
				inputContainer: "webm",
				tracks: [
					{ type: "video", codec: "vp9" },
					{ type: "audio", codec: "opus" },
				],
				outputContainer: "webm",
				videoCodec: "vp8",
				audioCodec: "vorbis",
			},
			{
				scenarioId: "transcode/vp9_to_vp8_webm",
				inputId: "scenarios/transcode/vp9_to_vp8_webm/02.webm",
				inputContainer: "webm",
				tracks: [
					{ type: "video", codec: "vp9" },
					{ type: "audio", codec: "opus" },
				],
				outputContainer: "webm",
				videoCodec: "vp8",
				audioCodec: "vorbis",
			},
		];

		for (const row of rows) {
			const concrete = request("transcode", row.inputContainer, row.tracks, {
				scenarioId: row.scenarioId,
				inputId: row.inputId,
				outputContainer: row.outputContainer,
				...(row.videoCodec !== undefined ? { videoCodec: row.videoCodec } : {}),
				...(row.audioCodec !== undefined ? { audioCodec: row.audioCodec } : {}),
				options: row.options,
			});
			expect(decideAibrushSupport(concrete), row.scenarioId).toMatchObject({
				supported: true,
			});
			concrete.inputs[0]!.id = row.inputId.replace(
				/\/(?:01|02|03)\.(mp4|webm|wav)$/,
				"/04.$1",
			);
			expect(
				decideAibrushSupport(concrete),
				`${row.scenarioId} neighbor`,
			).toMatchObject({ supported: true });
		}
	});

	test("admits the repaired implicit VP9 and AV1 quality variants", () => {
		const rows = [
			{
				scenarioId: "transcode/bframe_reorder_h264_to_vp9",
				inputId: "scenarios/transcode/bframe_reorder_h264_to_vp9/03.mp4",
				outputContainer: "webm",
				videoCodec: "vp9",
				audioCodec: "opus",
			},
			...["02.mp4", "03.mp4"].map((file) => ({
				scenarioId: "transcode/h264_to_vp9_webm",
				inputId: `scenarios/transcode/h264_to_vp9_webm/${file}`,
				outputContainer: "webm",
				videoCodec: "vp9",
				audioCodec: "opus",
			})),
			{
				scenarioId: "transcode/h264_to_av1_mp4",
				inputId: "scenarios/transcode/h264_to_av1_mp4/03.mp4",
				outputContainer: "mp4",
				videoCodec: "av1",
				audioCodec: undefined,
			},
		] as const;

		for (const row of rows) {
			expect(
				decideAibrushSupport(
					request("transcode", "mp4", [VIDEO, AUDIO], {
						scenarioId: row.scenarioId,
						inputId: row.inputId,
						outputContainer: row.outputContainer,
						videoCodec: row.videoCodec,
						...(row.audioCodec !== undefined
							? { audioCodec: row.audioCodec }
							: {}),
					}),
				),
				row.inputId,
			).toMatchObject({ supported: true });
		}
	});

	test("admits the repaired 44.1 kHz stereo Vorbis candidate", () => {
		const concrete = request(
			"transcode",
			"wav",
			[{ type: "audio", codec: "pcm-s16", sampleRate: 44_100, channels: 2 }],
			{
				scenarioId: "transcode/wav_to_vorbis_ogg",
				inputId: "scenarios/transcode/wav_to_vorbis_ogg/03.wav",
				outputContainer: "ogg",
				audioCodec: "vorbis",
				options: { invariant: "transcode-audio-content" },
			},
		);

		expect(decideAibrushSupport(concrete)).toEqual({ supported: true });
	});

	test("admits the presentation-complete VP9 resize variants", () => {
		for (const file of ["01.mp4", "02.mp4", "03.mp4"]) {
			const decision = decideAibrushSupport(
				request("transcode", "mp4", [VIDEO], {
					scenarioId: "transcode/video_only_h264_resize_360p_to_vp9_webm",
					inputId: `scenarios/transcode/video_only_h264_resize_360p_to_vp9_webm/${file}`,
					outputContainer: "webm",
					videoCodec: "vp9",
					outputWidth: 640,
					outputHeight: 360,
					transforms: { resize: { width: 640, height: 360 } },
					options: {
						video: {
							codec: "vp9",
							width: 640,
							height: 360,
							bitrate: 4_000_000,
						},
					},
				}),
			);
			expect(decision, file).toMatchObject({
				supported: true,
				browserConfigs: expect.arrayContaining([
					expect.objectContaining({
						role: "video-encoder",
						config: expect.objectContaining({
							codec: "vp09.00.10.08",
							width: 640,
							height: 360,
						}),
					}),
				]),
			});
		}
	});

	test("admits the repaired exact VP9 to AV1 candidate", () => {
		const decision = decideAibrushSupport(
			request(
				"transcode",
				"webm",
				[
					{
						type: "video",
						codec: "vp9",
						nativeCodecTag: "vp09.00.10.08",
						width: 1_920,
						height: 1_080,
						fps: 30,
					},
					{
						type: "audio",
						codec: "opus",
						nativeCodecTag: "opus",
						sampleRate: 48_000,
						channels: 2,
					},
				],
				{
					scenarioId: "transcode/vp9_to_av1_webm",
					inputId: "scenarios/transcode/vp9_to_av1_webm/02.webm",
					outputContainer: "webm",
					videoCodec: "av1",
					options: { video: { codec: "av1" } },
				},
			),
		);

		expect(decision).toMatchObject({
			supported: true,
			browserConfigs: expect.arrayContaining([
				expect.objectContaining({
					role: "video-encoder",
					config: expect.objectContaining({
						codec: "av01.0.04M.08",
						width: 1_920,
						height: 1_080,
					}),
				}),
			]),
		});
	});
});

describe("REQ-ENG-32: exact framework error taxonomy", () => {
	const classes = { CapabilityError, ConstraintUnsatisfiedError, InputError };

	test("uses the exact CapabilityError class/code and ignores diagnostic prose", () => {
		const error = new CapabilityError("completely rewritten diagnostic");
		expect(classifyAibrushFrameworkError(error, classes)).toMatchObject({
			kind: "capability",
			code: "capability-miss",
			reason: "completely rewritten diagnostic",
		});
		const thrown = captureThrown(() =>
			translateAibrushFrameworkError(
				"remux",
				error,
				classes,
				request("remux", "mp4", [VIDEO], { outputContainer: "webm" }),
				undefined,
				() => false,
				(_op, reason) => new Error(reason),
			),
		);
		expect(isNotApplicableError(thrown)).toBe(true);
		expect(thrown).toMatchObject({
			reasonCode: "AIBRUSH_FRAMEWORK_CAPABILITY_MISS",
			operation: "remux",
		});
	});

	test("does not trust a foreign error merely because its name/code/message resemble a capability miss", () => {
		const foreign = Object.assign(new Error("capability miss"), {
			name: "CapabilityError",
			code: "capability-miss",
		});
		expect(classifyAibrushFrameworkError(foreign, classes).kind).toBe("fault");
		expect(
			captureThrown(() =>
				translateAibrushFrameworkError(
					"mux",
					foreign,
					classes,
					undefined,
					undefined,
					() => false,
					(_op, reason) => new Error(reason),
				),
			),
		).toBe(foreign);
	});

	test("keeps malformed InputError rejection distinct from clean-input faults", () => {
		const error = new InputError("bad bytes");
		const malformed = captureThrown(() =>
			translateAibrushFrameworkError(
				"demux",
				error,
				classes,
				undefined,
				undefined,
				() => true,
				(_op, reason) =>
					Object.assign(new Error(reason), { name: "GracefulRejectionError" }),
			),
		);
		expect(malformed).toMatchObject({
			name: "GracefulRejectionError",
			message: "bad bytes",
		});
		expect(
			captureThrown(() =>
				translateAibrushFrameworkError(
					"demux",
					error,
					classes,
					undefined,
					undefined,
					() => false,
					(_op, reason) => new Error(reason),
				),
			),
		).toBe(error);
	});

	test("translates the exact bounded constraint class into a semantic failure with attempt evidence", () => {
		const evidence = {
			constraint: "h264-quality-rate",
			preferredAverageBitrate: 2_000_000,
			maxAverageBitrate: 2_600_000,
			minimumQualityMean: 0.95,
			metric: "ssim-luma-v1",
			attempts: [
				{
					attempt: 1,
					targetBytes: 250_000,
					actualBytes: 240_000,
					averageBitrate: 1_920_000,
					qualityMean: 0.92,
					qualitySamples: 8,
				},
			],
		} as const;
		const frameworkError = new ConstraintUnsatisfiedError(
			"no bounded candidate met both constraints",
			evidence,
		);
		expect(classifyAibrushFrameworkError(frameworkError, classes)).toEqual({
			kind: "constraint",
			code: "constraint-unsatisfied",
			reason: "no bounded candidate met both constraints",
			evidence,
		});

		const translated = captureThrown(() =>
			translateAibrushFrameworkError(
				"transcode",
				frameworkError,
				classes,
				undefined,
				undefined,
				() => false,
				(_op, reason) => new Error(reason),
			),
		);
		expect(isOperationConstraintUnsatisfiedError(translated)).toBe(true);
		expect(translated).toMatchObject({
			reasonCode: "TRANSCODE_CONSTRAINT_UNSATISFIED",
			operation: "transcode",
			evidence,
		});
		expect(
			isOperationConstraintUnsatisfiedError(structuredClone(translated)),
		).toBe(true);
	});

	test("does not trust a foreign constraint-unsatisfied lookalike", () => {
		const foreign = Object.assign(new Error("no bounded candidate"), {
			name: "ConstraintUnsatisfiedError",
			code: "constraint-unsatisfied",
			detail: {
				constraint: "h264-quality-rate",
				preferredAverageBitrate: 2_000_000,
				maxAverageBitrate: 2_600_000,
				minimumQualityMean: 0.95,
				metric: "ssim-luma-v1",
				attempts: [],
			},
		});
		expect(classifyAibrushFrameworkError(foreign, classes).kind).toBe("fault");
	});
});

function request(
	operation: ConcreteOperationRequest["operation"],
	inputContainer: string,
	tracks: NormalizedTrack[],
	overrides: {
		outputContainer?: string;
		videoCodec?: string;
		audioCodec?: string;
		options?: Record<string, unknown>;
		mutated?: boolean;
		scenarioId?: string;
		inputId?: string;
		inputSizeBytes?: number;
		outputWidth?: number;
		outputHeight?: number;
		outputSampleRate?: number;
		transforms?: ConcreteOperationRequest["transforms"];
	} = {},
): ConcreteOperationRequest {
	return {
		protocol: CONCRETE_OPERATION_PROTOCOL,
		scenarioId: overrides.scenarioId ?? `aibrush-test/${operation}`,
		operation,
		inputs: [
			{
				id: overrides.inputId ?? `fixture.${inputContainer}`,
				mime:
					inputContainer === "jpeg" || inputContainer === "png"
						? `image/${inputContainer}`
						: "application/octet-stream",
				container: inputContainer,
				mutated: overrides.mutated ?? false,
				sourceEvidence: "RESOLVED",
				tracks,
				sizeBytes: overrides.inputSizeBytes ?? 1_024,
			},
		],
		...(overrides.outputContainer !== undefined
			? {
					output: {
						container: overrides.outputContainer,
						...(overrides.videoCodec !== undefined
							? { videoCodec: overrides.videoCodec }
							: {}),
						...(overrides.audioCodec !== undefined
							? { audioCodec: overrides.audioCodec }
							: {}),
						...(overrides.outputWidth !== undefined
							? { width: overrides.outputWidth }
							: {}),
						...(overrides.outputHeight !== undefined
							? { height: overrides.outputHeight }
							: {}),
						...(overrides.outputSampleRate !== undefined
							? { sampleRate: overrides.outputSampleRate }
							: {}),
					},
				}
			: {}),
		...(overrides.transforms !== undefined
			? { transforms: overrides.transforms }
			: {}),
		options: overrides.options ?? {},
	};
}

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	throw new Error("expected callback to throw");
}

async function fixtureInput(
	filename: string,
	mime: string,
): Promise<MediaInput> {
	const bytes = new Uint8Array(
		await Bun.file(`fixtures/media/${filename}`).arrayBuffer(),
	);
	return {
		id: filename,
		url: `blob:http://127.0.0.1:5151/${filename}`,
		mime,
		mutated: false,
		sizeBytes: bytes.byteLength,
		blob: () =>
			Promise.resolve(new Blob([bytes.slice().buffer], { type: mime })),
		arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
	};
}

function rangeBackedInput(
	filename: string,
	mime: string,
	bytes: Uint8Array,
): MediaInput {
	return {
		id: filename,
		url: `http://127.0.0.1:5151/${filename}`,
		mime,
		mutated: false,
		sizeBytes: bytes.byteLength,
		blob: () =>
			Promise.resolve(new Blob([bytes.slice().buffer], { type: mime })),
		arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
	};
}

function installRangeFetch(bytes: Uint8Array): void {
	Object.defineProperty(globalThis, "fetch", {
		configurable: true,
		writable: true,
		value: async (
			resource: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> => {
			const requestHeaders =
				resource instanceof Request ? resource.headers : undefined;
			const headers = new Headers(requestHeaders);
			new Headers(init?.headers).forEach((value, key) =>
				headers.set(key, value),
			);
			const range = headers.get("Range");
			if (range === null) {
				return new Response(bytes.slice(), {
					status: 200,
					headers: {
						"Accept-Ranges": "bytes",
						"Content-Length": String(bytes.byteLength),
					},
				});
			}
			const match = /^bytes=(\d*)-(\d*)$/.exec(range);
			if (match === null || (match[1] === "" && match[2] === "")) {
				throw new Error(`unexpected Range '${range}'`);
			}
			const requestedStart =
				match[1] === ""
					? Math.max(0, bytes.byteLength - Number(match[2]))
					: Number(match[1]);
			const requestedEnd =
				match[1] === "" || match[2] === ""
					? bytes.byteLength - 1
					: Math.min(bytes.byteLength - 1, Number(match[2]));
			if (requestedStart >= bytes.byteLength || requestedEnd < requestedStart) {
				return new Response(undefined, {
					status: 416,
					headers: { "Content-Range": `bytes */${bytes.byteLength}` },
				});
			}
			const body = bytes.slice(requestedStart, requestedEnd + 1);
			return new Response(body, {
				status: 206,
				headers: {
					"Accept-Ranges": "bytes",
					"Content-Length": String(body.byteLength),
					"Content-Range": `bytes ${requestedStart}-${requestedEnd}/${bytes.byteLength}`,
				},
			});
		},
	});
}

function insertWavJunkBeforeData(
	bytes: Uint8Array,
	junkBodyBytes: number,
): Uint8Array {
	const dataChunkOffset = wavDataChunkOffset(bytes);
	const paddedJunkBytes = junkBodyBytes + (junkBodyBytes & 1);
	const insertedBytes = 8 + paddedJunkBytes;
	const output = new Uint8Array(bytes.byteLength + insertedBytes);
	output.set(bytes.subarray(0, dataChunkOffset), 0);
	output.set([0x4a, 0x55, 0x4e, 0x4b], dataChunkOffset);
	new DataView(output.buffer).setUint32(
		dataChunkOffset + 4,
		junkBodyBytes,
		true,
	);
	output.set(bytes.subarray(dataChunkOffset), dataChunkOffset + insertedBytes);
	new DataView(output.buffer).setUint32(4, output.byteLength - 8, true);
	return output;
}

function wavDataChunkOffset(bytes: Uint8Array): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let dataChunkOffset = 12;
	while (dataChunkOffset + 8 <= bytes.byteLength) {
		const chunkId = String.fromCharCode(
			bytes[dataChunkOffset]!,
			bytes[dataChunkOffset + 1]!,
			bytes[dataChunkOffset + 2]!,
			bytes[dataChunkOffset + 3]!,
		);
		if (chunkId === "data") break;
		const chunkBytes = view.getUint32(dataChunkOffset + 4, true);
		dataChunkOffset += 8 + chunkBytes + (chunkBytes & 1);
	}
	if (dataChunkOffset + 8 > bytes.byteLength)
		throw new Error("test WAV has no data chunk");
	return dataChunkOffset;
}

function directContext(
	operationRequest: ConcreteOperationRequest,
): OperationContext {
	return {
		signal: new AbortController().signal,
		phase: "functional",
		emit: () => undefined,
		request: operationRequest,
		checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
	};
}

function restoreGlobal(
	name: string,
	descriptor: PropertyDescriptor | undefined,
): void {
	if (descriptor !== undefined)
		Object.defineProperty(globalThis, name, descriptor);
	else Reflect.deleteProperty(globalThis, name);
}

describe("performance evidence boundaries", () => {
	test("admits current 320p quality routes and pull-driven massive packet iteration", () => {
		const quality = request("transcode", "mp4", [VIDEO, AUDIO], {
			scenarioId: "performance/convert-longtasks",
			inputId: "scenarios/performance/convert-longtasks/03.mp4",
			outputContainer: "webm",
			videoCodec: "vp9",
			audioCodec: "opus",
		});
		expect(decideAibrushSupport(quality)).toMatchObject({ supported: true });
		quality.inputs[0]!.id = "scenarios/performance/convert-longtasks/02.mp4";
		expect(decideAibrushSupport(quality)).toMatchObject({ supported: true });

		const massive = request("demux", "mp4", [], {
			scenarioId: "performance/size-ladder-iterate-packets-massive",
			inputId: "massive_h264_1080p_2h.mp4",
		});
		expect(decideAibrushSupport(massive)).toEqual({ supported: true });
	});

	test("source-resolution performance rows probe the exact runtime 1920x1080 VP9 tuple", () => {
		for (const scenarioId of [
			"performance/encode-fps",
			"performance/metamorphic-transcode-idempotent-source-res",
		]) {
			const sourceResolution = request("transcode", "mp4", [VIDEO, AUDIO], {
				scenarioId,
				inputId: "h264_1080p_30s.mp4",
				outputContainer: "webm",
				videoCodec: "vp9",
				audioCodec: "opus",
				outputWidth: 1_920,
				outputHeight: 1_080,
				options: {
					container: "webm",
					video: { codec: "vp9", width: 1_920, height: 1_080 },
					audio: { codec: "opus" },
				},
				transforms: { resize: { width: 1_920, height: 1_080 } },
			});

			expect(decideAibrushSupport(sourceResolution), scenarioId).toEqual({
				supported: true,
				browserConfigs: [
					{
						role: "video-decoder",
						trackIndex: 0,
						config: {
							codec: "avc1.640028",
							codedWidth: 1_920,
							codedHeight: 1_080,
						},
					},
					{
						role: "video-encoder",
						config: {
							codec: "vp09.00.10.08",
							width: 1_920,
							height: 1_080,
							bitrate: 2_000_000,
							framerate: 30,
						},
					},
				],
			});
		}
	});
});
