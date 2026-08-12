import {
	transcodeError,
	transcodeUnavailable,
	transcodeVerdict,
	type TranscodeDecision,
} from "./types.ts";
import { readMuxOrientation } from "../mux/rotation.ts";

export const TRANSCODE_TRANSFORM_SCHEMA =
	"media-test/transcode-transform@1" as const;

export type ColorPrimaries = "bt709" | "bt2020";
export type TransferCharacteristic = "bt709" | "bt2020-10" | "pq";
export type MatrixCoefficient = "bt709" | "bt2020-ncl" | "rgb";
export type ColorRange = "limited" | "full";

export type TransformStep =
	| Readonly<{ kind: "normalize-display-orientation" }>
	| Readonly<{
			kind: "resize";
			width: number;
			height: number;
			filter: "bilinear";
	  }>
	| Readonly<{ kind: "rotate"; degrees: 90 | 180 | 270 }>
	| Readonly<{ kind: "flip"; axis: "horizontal" | "vertical" }>
	| Readonly<{
			kind: "crop";
			x: number;
			y: number;
			width: number;
			height: number;
	  }>
	| Readonly<{
			kind: "contain-pad";
			width: number;
			height: number;
			placement: "center";
			color: readonly [number, number, number, number];
	  }>
	| Readonly<{
			kind: "color-convert";
			from: ColorPrimaries;
			to: ColorPrimaries;
	  }>
	| Readonly<{
			kind: "tone-map";
			from: "pq-bt2020";
			to: "bt709-sdr";
			operator: "reinhard";
			targetPeakNits: number;
	  }>
	| Readonly<{
			kind: "depth-convert";
			fromBitDepth: number;
			toBitDepth: number;
	  }>
	| Readonly<{ kind: "preserve-alpha" }>;

export interface TransformSignalExpectation {
	readonly rotationDegrees?: 0 | 90 | 180 | 270;
	readonly colorPrimaries?: ColorPrimaries;
	readonly transfer?: TransferCharacteristic;
	readonly matrix?: MatrixCoefficient;
	readonly range?: ColorRange;
	readonly bitDepth?: number;
	readonly alphaMode?: "straight" | "opaque";
}

export interface TransformSignalEvidence {
	readonly rotationDegrees?: number;
	readonly colorPrimaries?: string;
	readonly transfer?: string;
	readonly matrix?: string;
	readonly range?: string;
	readonly bitDepth?: number;
	readonly alphaMode?: string;
}

type MutableTransformSignalEvidence = {
	-readonly [Key in keyof TransformSignalEvidence]: TransformSignalEvidence[Key];
};

export type TransformSignalReadResult =
	| Readonly<{
			state: "OK";
			value: TransformSignalEvidence;
			reader: "isobmff-video-signal" | "matroska-video-signal";
	  }>
	| Readonly<{
			state:
				| "UNSUPPORTED_FORMAT"
				| "UNSUPPORTED_STRUCTURE"
				| "MALFORMED"
				| "INCOMPLETE";
			reasonCode: string;
			detail: string;
	  }>;

export interface TransformPixelTolerance {
	/** Normalized [0,1] RGBA error over every compared channel. */
	readonly meanAbsoluteError: number;
	readonly maxAbsoluteError: number;
	/** Maximum fraction of channels allowed above maxAbsoluteError (a bounded lossy-codec tail). */
	readonly maxOutlierFraction: number;
	readonly maxAlphaError: number;
	/** Minimum mean change required before a fixture can prove a non-identity effect. */
	readonly minimumObservableEffect: number;
}

export interface TranscodeTransformContract {
	readonly schema: typeof TRANSCODE_TRANSFORM_SCHEMA;
	readonly steps: readonly TransformStep[];
	/** Independently observed input signal required before a signal-changing transform can be graded. */
	readonly sourceSignal?: TransformSignalExpectation;
	readonly signal: TransformSignalExpectation;
	readonly tolerance: TransformPixelTolerance;
	readonly timestampToleranceUs: number;
	/** Color/tone-map implementations may legally differ while still proving a non-identity effect. */
	readonly allowAlternatePixelMapping: boolean;
	/** Minimum completion on either the target-coordinate or decoded-sRGB endpoint axis. */
	readonly minimumEffectCompletionRatio?: number;
	/** Browser-normalized pixels delegate fidelity to the scenario's independent perceptual oracle. */
	readonly pixelComparison: "strict" | "independent-perceptual";
}

export interface TranscodePixelFrame {
	readonly ptsUs: number;
	readonly durationUs?: number;
	readonly width: number;
	readonly height: number;
	readonly bitDepth: number;
	/** Tightly packed RGBA normalized to sRGB by the neutral WebCodecs readback boundary. */
	readonly data: Uint8Array | Uint8ClampedArray | Uint16Array;
}

interface FloatPlane {
	width: number;
	height: number;
	bitDepth: number;
	data: Float64Array;
}

export function defineTranscodeTransformContract(
	value: Omit<TranscodeTransformContract, "schema" | "pixelComparison"> &
		Partial<Pick<TranscodeTransformContract, "pixelComparison">>,
): TranscodeTransformContract {
	if (value.steps.length === 0)
		throw new TypeError(
			"transcode transform contract requires at least one step",
		);
	if (
		!Number.isFinite(value.timestampToleranceUs) ||
		value.timestampToleranceUs < 0
	) {
		throw new TypeError(
			"transform timestamp tolerance must be finite and non-negative",
		);
	}
	if (
		value.minimumEffectCompletionRatio !== undefined &&
		(!Number.isFinite(value.minimumEffectCompletionRatio) ||
			value.minimumEffectCompletionRatio < 0 ||
			value.minimumEffectCompletionRatio > 1)
	) {
		throw new TypeError(
			"transform minimum effect completion ratio must be within [0,1]",
		);
	}
	for (const [name, limit] of Object.entries(value.tolerance)) {
		if (!Number.isFinite(limit) || limit < 0 || limit > 1) {
			throw new TypeError(`transform tolerance ${name} must be within [0,1]`);
		}
	}
	validateSignal(value.signal);
	if (value.sourceSignal !== undefined) validateSignal(value.sourceSignal);
	for (const step of value.steps) validateStep(step);
	return deepFreeze({
		schema: TRANSCODE_TRANSFORM_SCHEMA,
		pixelComparison: "strict",
		...value,
	});
}

/**
 * Read authored transform signaling directly from the candidate bytes. The result is deliberately
 * partial: an absent `colr`/Colour/AlphaMode field stays absent so the effect oracle cannot fill it
 * from requested options. Container damage is kept distinct from an unsupported reader shape.
 */
export function readTranscodeTransformSignal(
	bytes: Uint8Array,
	containerHint?: string,
): TransformSignalReadResult {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8) {
		return signalReadProblem(
			"INCOMPLETE",
			"TRANSCODE_TRANSFORM_SIGNAL_INPUT_INCOMPLETE",
			"transform signaling input is empty or truncated",
		);
	}
	const container = canonicalSignalContainer(containerHint);
	try {
		if (container === "mp4" || container === "mov" || looksLikeIsoBmff(bytes)) {
			return readIsoBmffTransformSignal(
				bytes,
				container === "mov" ? "mov" : "mp4",
			);
		}
		if (container === "webm" || container === "mkv" || looksLikeEbml(bytes)) {
			return readMatroskaTransformSignal(
				bytes,
				container === "mkv" ? "mkv" : "webm",
			);
		}
		return signalReadProblem(
			"UNSUPPORTED_FORMAT",
			"TRANSCODE_TRANSFORM_SIGNAL_FORMAT_UNSUPPORTED",
			`neutral transform-signal reader does not support '${containerHint ?? "sniffed bytes"}'`,
		);
	} catch (error) {
		const issue =
			error instanceof TransformSignalReadError
				? error
				: new TransformSignalReadError(
						"MALFORMED",
						"TRANSCODE_TRANSFORM_SIGNAL_READER_FAILURE",
						error instanceof Error ? error.message : String(error),
					);
		return signalReadProblem(issue.state, issue.reasonCode, issue.message);
	}
}

/** Apply the authored reference transform to actual sample values, not just dimensions/metadata. */
export function applyTranscodeTransform(
	source: TranscodePixelFrame,
	contract: TranscodeTransformContract,
): TranscodePixelFrame {
	let plane = toFloatPlane(source);
	for (const step of contract.steps) {
		switch (step.kind) {
			case "normalize-display-orientation":
				// Oracle source pixels are decoded in display space, so the container matrix is already
				// applied. Normalization preserves those displayed pixels while compareSignal proves that
				// the candidate authored an identity output matrix.
				break;
			case "resize":
				plane = resizeBilinear(plane, step.width, step.height);
				break;
			case "rotate":
				plane = rotate(plane, step.degrees);
				break;
			case "flip":
				plane = flip(plane, step.axis);
				break;
			case "crop":
				plane = crop(plane, step);
				break;
			case "contain-pad":
				plane = containPad(plane, step);
				break;
			case "color-convert":
				// Neutral source pixels come from VideoFrame.copyTo(RGBA), whose target colorSpace defaults to
				// sRGB. Build the authored reference from that actual representation, not from the source's former
				// video-transfer coordinates. Candidate sRGB readback is mapped into the same target coordinates
				// by comparisonPlane() below before any sample is graded.
				plane = convertNormalizedSrgbToPrimaries(plane, step.to);
				break;
			case "tone-map":
				// Neutral HDR source and candidate pixels cross the same browser <video> -> canvas presenter.
				// Those RGBA values are already normalized sRGB presentation values, not the source's former
				// PQ/BT.2020 code values. Re-applying the PQ EOTF here would tone-map the browser-normalized
				// presentation a second time. The pixel invariant at this seam is therefore presentation
				// preservation; sourceSignal + candidate signal independently prove the actual
				// PQ/BT.2020/10-bit -> SDR/BT.709/8-bit transition.
				plane = normalizedSrgbToneMapPresentation(plane, step.targetPeakNits);
				break;
			case "depth-convert":
				if (plane.bitDepth !== step.fromBitDepth) {
					throw new TypeError(
						`depth transform expects ${step.fromBitDepth}-bit source, observed ${plane.bitDepth}-bit`,
					);
				}
				plane = quantize(plane, step.toBitDepth);
				break;
			case "preserve-alpha":
				break;
		}
	}
	return fromFloatPlane(source.ptsUs, source.durationUs, plane);
}

/**
 * Grade decoded candidate pixels and independent authored signaling together. Missing signaling is
 * unavailable evidence; an observed wrong value or a pixel no-op is a semantic FAIL.
 */
export function evaluateTranscodeTransform(
	sourceFrames: readonly TranscodePixelFrame[],
	candidateFrames: readonly TranscodePixelFrame[],
	signal: TransformSignalEvidence,
	contract: TranscodeTransformContract,
): TranscodeDecision {
	const signalDecision = compareSignal(signal, contract.signal);
	if (signalDecision) return signalDecision;
	if (sourceFrames.length === 0 || candidateFrames.length === 0) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_FRAMES_EMPTY",
			`effect oracle received ${sourceFrames.length} source and ${candidateFrames.length} candidate frame(s)`,
		);
	}
	if (sourceFrames.length !== candidateFrames.length) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_FRAME_COUNT_MISMATCH",
			`effect oracle received ${sourceFrames.length} source and ${candidateFrames.length} candidate frame(s)`,
		);
	}

	let pairs: Array<{
		source: TranscodePixelFrame;
		candidate: TranscodePixelFrame;
	}>;
	try {
		pairs = matchEffectFrames(
			sourceFrames,
			candidateFrames,
			contract.timestampToleranceUs,
		);
	} catch (error) {
		return transcodeError(
			"TRANSCODE_TRANSFORM_TIMELINE_INVALID",
			error instanceof Error ? error.message : String(error),
		);
	}
	if (pairs.length !== candidateFrames.length) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_TIMELINE_COVERAGE_MISMATCH",
			`${candidateFrames.length - pairs.length}/${candidateFrames.length} candidate frame(s) have no source presentation instant`,
			{
				sourceFrames: sourceFrames.length,
				candidateFrames: candidateFrames.length,
				matchedFrames: pairs.length,
			},
		);
	}

	let absoluteError = 0;
	let maximumError = 0;
	let alphaMaximumError = 0;
	let sampleCount = 0;
	let referenceSourceDelta = 0;
	let candidateSourceDelta = 0;
	let comparableSourceSamples = 0;
	let maximumErrorOutliers = 0;
	let semanticReferenceDelta = 0;
	let semanticCandidateDelta = 0;
	let semanticEndpointError = 0;
	let semanticReferenceEnergy = 0;
	let semanticCandidateEnergy = 0;
	let semanticProjection = 0;
	let semanticSamples = 0;
	const channelAbsoluteError = [0, 0, 0, 0];
	const channelSignedError = [0, 0, 0, 0];
	const channelMaximumError = [0, 0, 0, 0];
	const channelOutliers = [0, 0, 0, 0];
	const channelSamples = [0, 0, 0, 0];
	const quadrantAbsoluteError = [0, 0, 0, 0];
	const quadrantOutliers = [0, 0, 0, 0];
	const quadrantSamples = [0, 0, 0, 0];
	const frameAbsoluteError: number[] = [];
	const frameOutliers: number[] = [];
	const frameSamples: number[] = [];
	let maximumTimestampDeltaUs = 0;
	const colorTarget = colorTargetForContract(contract);
	const hasColorConversion = colorTarget !== undefined;

	try {
		for (const [pairIndex, pair] of pairs.entries()) {
			const expected = applyTranscodeTransform(pair.source, contract);
			maximumTimestampDeltaUs = Math.max(
				maximumTimestampDeltaUs,
				Math.abs(pair.candidate.ptsUs - pair.source.ptsUs),
			);
			if (
				pair.candidate.width !== expected.width ||
				pair.candidate.height !== expected.height
			) {
				return transcodeVerdict(
					"FAIL",
					"TRANSCODE_TRANSFORM_DIMENSIONS_MISMATCH",
					`candidate ${pair.candidate.width}x${pair.candidate.height} at ${pair.candidate.ptsUs}us; ` +
						`expected ${expected.width}x${expected.height}`,
					{ matchedFrames: pairs.length },
				);
			}
			if (pair.candidate.bitDepth !== expected.bitDepth) {
				return transcodeVerdict(
					"FAIL",
					"TRANSCODE_TRANSFORM_PIXEL_DEPTH_MISMATCH",
					`candidate pixels are ${pair.candidate.bitDepth}-bit; expected ${expected.bitDepth}-bit`,
				);
			}
			const candidatePresentation = toFloatPlane(pair.candidate);
			const got =
				colorTarget === undefined
					? candidatePresentation
					: convertNormalizedSrgbToPrimaries(
							candidatePresentation,
							colorTarget,
						);
			const want = toFloatPlane(expected);
			for (let index = 0; index < want.data.length; index++) {
				const signedDelta = got.data[index]! - want.data[index]!;
				const delta = Math.abs(signedDelta);
				const channel = index % 4;
				const pixel = Math.floor(index / 4);
				const x = pixel % want.width;
				const y = Math.floor(pixel / want.width);
				const quadrant =
					(y >= want.height / 2 ? 2 : 0) + (x >= want.width / 2 ? 1 : 0);
				absoluteError += delta;
				maximumError = Math.max(maximumError, delta);
				if (index % 4 === 3)
					alphaMaximumError = Math.max(alphaMaximumError, delta);
				channelAbsoluteError[channel] =
					(channelAbsoluteError[channel] ?? 0) + delta;
				channelSignedError[channel] =
					(channelSignedError[channel] ?? 0) + signedDelta;
				channelMaximumError[channel] = Math.max(
					channelMaximumError[channel] ?? 0,
					delta,
				);
				channelSamples[channel] = (channelSamples[channel] ?? 0) + 1;
				quadrantAbsoluteError[quadrant] =
					(quadrantAbsoluteError[quadrant] ?? 0) + delta;
				quadrantSamples[quadrant] = (quadrantSamples[quadrant] ?? 0) + 1;
				frameAbsoluteError[pairIndex] =
					(frameAbsoluteError[pairIndex] ?? 0) + delta;
				frameSamples[pairIndex] = (frameSamples[pairIndex] ?? 0) + 1;
				if (delta > contract.tolerance.maxAbsoluteError) {
					maximumErrorOutliers++;
					channelOutliers[channel] = (channelOutliers[channel] ?? 0) + 1;
					quadrantOutliers[quadrant] = (quadrantOutliers[quadrant] ?? 0) + 1;
					frameOutliers[pairIndex] = (frameOutliers[pairIndex] ?? 0) + 1;
				}
				sampleCount++;
			}
			if (
				pair.source.width === expected.width &&
				pair.source.height === expected.height
			) {
				const original = toFloatPlane(pair.source);
				for (let index = 0; index < want.data.length; index++) {
					referenceSourceDelta += Math.abs(
						want.data[index]! - original.data[index]!,
					);
					candidateSourceDelta += Math.abs(
						got.data[index]! - original.data[index]!,
					);
					comparableSourceSamples++;
				}
				if (colorTarget !== undefined) {
					const signalOnlyRetag = rawColorRetagPresentation(
						original,
						colorTarget,
					);
					for (let index = 0; index < original.data.length; index++) {
						if (index % 4 === 3) continue;
						const axis = original.data[index]! - signalOnlyRetag.data[index]!;
						const movement =
							candidatePresentation.data[index]! - signalOnlyRetag.data[index]!;
						semanticReferenceDelta += Math.abs(axis);
						semanticCandidateDelta += Math.abs(movement);
						semanticEndpointError += Math.abs(
							candidatePresentation.data[index]! - original.data[index]!,
						);
						semanticReferenceEnergy += axis * axis;
						semanticCandidateEnergy += movement * movement;
						semanticProjection += movement * axis;
						semanticSamples++;
					}
				}
			}
		}
	} catch (error) {
		return transcodeError(
			"TRANSCODE_TRANSFORM_REFERENCE_ERROR",
			error instanceof Error ? error.message : String(error),
		);
	}

	const meanAbsoluteError = sampleCount
		? absoluteError / sampleCount
		: Number.POSITIVE_INFINITY;
	const meanReferenceSourceDelta = comparableSourceSamples
		? referenceSourceDelta / comparableSourceSamples
		: Number.POSITIVE_INFINITY;
	const meanCandidateSourceDelta = comparableSourceSamples
		? candidateSourceDelta / comparableSourceSamples
		: Number.POSITIVE_INFINITY;
	const targetCoordinateClosenessRatio =
		comparableSourceSamples > 0 && meanReferenceSourceDelta > 0
			? 1 - meanAbsoluteError / meanReferenceSourceDelta
			: Number.POSITIVE_INFINITY;
	const meanSemanticReferenceDelta =
		semanticSamples > 0
			? semanticReferenceDelta / semanticSamples
			: Number.POSITIVE_INFINITY;
	const meanSemanticCandidateDelta =
		semanticSamples > 0
			? semanticCandidateDelta / semanticSamples
			: Number.POSITIVE_INFINITY;
	const meanSemanticEndpointError =
		semanticSamples > 0
			? semanticEndpointError / semanticSamples
			: Number.POSITIVE_INFINITY;
	const effectCompletionRatio =
		hasColorConversion && semanticReferenceEnergy > 0
			? semanticProjection / semanticReferenceEnergy
			: targetCoordinateClosenessRatio;
	const effectDirectionCosine =
		hasColorConversion &&
		semanticReferenceEnergy > 0 &&
		semanticCandidateEnergy > 0
			? semanticProjection /
				Math.sqrt(semanticReferenceEnergy * semanticCandidateEnergy)
			: Number.POSITIVE_INFINITY;
	const channelNames = ["red", "green", "blue", "alpha"] as const;
	const quadrantNames = [
		"topLeft",
		"topRight",
		"bottomLeft",
		"bottomRight",
	] as const;
	const diagnosticMeasurements: Record<string, number> = {
		maximumTimestampDeltaUs,
	};
	for (const [channel, name] of channelNames.entries()) {
		const count = channelSamples[channel] ?? 0;
		diagnosticMeasurements[`${name}MeanAbsoluteError`] = count
			? (channelAbsoluteError[channel] ?? 0) / count
			: Number.POSITIVE_INFINITY;
		diagnosticMeasurements[`${name}MeanSignedError`] = count
			? (channelSignedError[channel] ?? 0) / count
			: Number.POSITIVE_INFINITY;
		diagnosticMeasurements[`${name}MaximumAbsoluteError`] =
			channelMaximumError[channel] ?? 0;
		diagnosticMeasurements[`${name}OutlierFraction`] = count
			? (channelOutliers[channel] ?? 0) / count
			: Number.POSITIVE_INFINITY;
	}
	for (const [quadrant, name] of quadrantNames.entries()) {
		const count = quadrantSamples[quadrant] ?? 0;
		diagnosticMeasurements[`${name}MeanAbsoluteError`] = count
			? (quadrantAbsoluteError[quadrant] ?? 0) / count
			: Number.POSITIVE_INFINITY;
		diagnosticMeasurements[`${name}OutlierFraction`] = count
			? (quadrantOutliers[quadrant] ?? 0) / count
			: Number.POSITIVE_INFINITY;
	}
	for (let frame = 0; frame < frameSamples.length; frame++) {
		const count = frameSamples[frame] ?? 0;
		diagnosticMeasurements[`frame${frame}MeanAbsoluteError`] = count
			? (frameAbsoluteError[frame] ?? 0) / count
			: Number.POSITIVE_INFINITY;
		diagnosticMeasurements[`frame${frame}OutlierFraction`] = count
			? (frameOutliers[frame] ?? 0) / count
			: Number.POSITIVE_INFINITY;
	}
	const measurements = {
		sourceFrames: sourceFrames.length,
		candidateFrames: candidateFrames.length,
		matchedFrames: pairs.length,
		meanAbsoluteError,
		maximumAbsoluteError: maximumError,
		maximumErrorOutliers,
		maximumErrorOutlierFraction: sampleCount
			? maximumErrorOutliers / sampleCount
			: Number.POSITIVE_INFINITY,
		maximumAlphaError: alphaMaximumError,
		meanReferenceSourceDelta,
		meanCandidateSourceDelta,
		targetCoordinateClosenessRatio,
		meanSemanticReferenceDelta,
		meanSemanticCandidateDelta,
		meanSemanticEndpointError,
		effectCompletionRatio,
		effectDirectionCosine,
		...diagnosticMeasurements,
	};

	if (contract.pixelComparison === "independent-perceptual") {
		return transcodeVerdict(
			"PASS",
			"TRANSCODE_TRANSFORM_SIGNAL_AND_SHAPE_MATCH",
			`${pairs.length} timestamp-paired frame(s) match the required dimensions, depth, timeline, and authored signaling; ` +
				"pixel fidelity is gated independently by the required perceptual oracle",
			measurements,
		);
	}

	const requiresVisibleEffect = contract.steps.some(
		(step) =>
			step.kind !== "depth-convert" &&
			step.kind !== "preserve-alpha" &&
			step.kind !== "normalize-display-orientation" &&
			step.kind !== "tone-map",
	);
	const referenceEffectDelta = hasColorConversion
		? meanSemanticReferenceDelta
		: meanReferenceSourceDelta;
	const candidateEffectDelta = hasColorConversion
		? meanSemanticCandidateDelta
		: meanCandidateSourceDelta;
	// This midpoint only classifies candidates still nearest the independently synthesized no-op endpoint.
	// The projection gate below separately proves progress toward the authored presentation endpoint.
	const noOpEffectCeiling = hasColorConversion
		? Math.max(
				contract.tolerance.minimumObservableEffect,
				referenceEffectDelta * 0.5,
			)
		: contract.tolerance.minimumObservableEffect;
	if (
		requiresVisibleEffect &&
		comparableSourceSamples > 0 &&
		referenceEffectDelta < contract.tolerance.minimumObservableEffect
	) {
		return transcodeUnavailable(
			"NA_ASSET",
			"TRANSCODE_TRANSFORM_SOURCE_NOT_DISCRIMINATING",
			"source pixels do not visibly distinguish the requested transform from identity",
			measurements,
		);
	}
	if (
		requiresVisibleEffect &&
		comparableSourceSamples > 0 &&
		candidateEffectDelta < noOpEffectCeiling &&
		referenceEffectDelta >= contract.tolerance.minimumObservableEffect
	) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_EFFECT_NOT_OBSERVED",
			"candidate pixels remain an observable no-op even though the reference transform changes the fixture",
			measurements,
		);
	}
	if (alphaMaximumError > contract.tolerance.maxAlphaError) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_ALPHA_MISMATCH",
			`alpha error ${alphaMaximumError.toFixed(6)} exceeds ${contract.tolerance.maxAlphaError}`,
			measurements,
		);
	}
	const completionThreshold = contract.minimumEffectCompletionRatio;
	const targetCoordinateCompletion =
		completionThreshold !== undefined &&
		targetCoordinateClosenessRatio >= completionThreshold;
	const decodedSrgbCompletion =
		completionThreshold !== undefined &&
		effectCompletionRatio >= completionThreshold;
	if (
		completionThreshold !== undefined &&
		comparableSourceSamples > 0 &&
		referenceEffectDelta >= contract.tolerance.minimumObservableEffect &&
		!targetCoordinateCompletion &&
		!decodedSrgbCompletion
	) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_EFFECT_INCOMPLETE",
			`candidate reaches ${(targetCoordinateClosenessRatio * 100).toFixed(2)}% target-coordinate closeness and ` +
				`${(effectCompletionRatio * 100).toFixed(2)}% decoded-sRGB no-op→authored projection; ` +
				`at least one axis must reach ${(completionThreshold * 100).toFixed(2)}%`,
			measurements,
		);
	}
	if (
		hasColorConversion &&
		semanticSamples > 0 &&
		meanSemanticEndpointError > contract.tolerance.meanAbsoluteError
	) {
		return transcodeVerdict(
			"FAIL",
			"TRANSCODE_TRANSFORM_SEMANTIC_RESIDUAL_EXCESSIVE",
			`decoded-sRGB residual ${meanSemanticEndpointError.toFixed(6)} exceeds the independent ` +
				`codec mean-error bound ${contract.tolerance.meanAbsoluteError}`,
			measurements,
		);
	}
	const maximumErrorOutlierFraction = sampleCount
		? maximumErrorOutliers / sampleCount
		: Number.POSITIVE_INFINITY;
	const tailWithinLimit =
		maximumError <= contract.tolerance.maxAbsoluteError ||
		maximumErrorOutlierFraction <= contract.tolerance.maxOutlierFraction;
	if (
		meanAbsoluteError <= contract.tolerance.meanAbsoluteError &&
		tailWithinLimit
	) {
		return transcodeVerdict(
			"PASS",
			"TRANSCODE_TRANSFORM_EFFECT_MATCH",
			`${pairs.length} timestamp-paired frame(s) match requested pixels and authored signaling`,
			measurements,
		);
	}

	const legalAlternate =
		contract.allowAlternatePixelMapping &&
		comparableSourceSamples > 0 &&
		candidateEffectDelta >= contract.tolerance.minimumObservableEffect &&
		meanAbsoluteError < meanReferenceSourceDelta &&
		meanAbsoluteError <=
			Math.max(
				contract.tolerance.meanAbsoluteError * 4,
				meanReferenceSourceDelta * 0.75,
			);
	if (legalAlternate) {
		return transcodeVerdict(
			"PASS",
			"TRANSCODE_TRANSFORM_ALTERNATE_VALID_MAPPING",
			"candidate proves the requested color/tone-map effect and signaling but uses a valid alternate mapping",
			measurements,
		);
	}
	return transcodeVerdict(
		"FAIL",
		"TRANSCODE_TRANSFORM_PIXEL_MISMATCH",
		`pixel error mean=${meanAbsoluteError.toFixed(6)}, max=${maximumError.toFixed(6)}, ` +
			`outliers=${maximumErrorOutlierFraction.toFixed(6)} exceeds mean<=${contract.tolerance.meanAbsoluteError}, ` +
			`max<=${contract.tolerance.maxAbsoluteError} for all but ${contract.tolerance.maxOutlierFraction} of channels`,
		measurements,
	);
}

/**
 * Validate the immutable source signal for transforms whose normalized-RGBA pixel seam cannot retain it.
 * A missing or wrong source is an asset-evidence gap, never permission to grade a signal-only relabel.
 */
export function evaluateTranscodeTransformSourceSignal(
	actual: TransformSignalEvidence,
	contract: TranscodeTransformContract,
): TranscodeDecision | undefined {
	const expected = contract.sourceSignal;
	if (expected === undefined) return undefined;
	const missing: string[] = [];
	for (const [key, wanted] of Object.entries(expected)) {
		if (wanted === undefined) continue;
		const observed = actual[key as keyof TransformSignalEvidence];
		if (observed === undefined || observed === null || observed === "") {
			missing.push(key);
			continue;
		}
		const equal =
			typeof wanted === "string"
				? String(observed).trim().toLowerCase() === wanted
				: observed === wanted;
		if (!equal) {
			return transcodeUnavailable(
				"NA_ASSET",
				"TRANSCODE_TRANSFORM_SOURCE_SIGNALING_MISMATCH",
				`source ${key}=${String(observed)}; required ${String(wanted)}`,
			);
		}
	}
	if (missing.length > 0) {
		return transcodeUnavailable(
			"NA_ASSET",
			"TRANSCODE_TRANSFORM_SOURCE_SIGNALING_UNAVAILABLE",
			`independent source readers did not expose ${missing.join(", ")}`,
		);
	}
	return undefined;
}

function compareSignal(
	actual: TransformSignalEvidence,
	expected: TransformSignalExpectation,
): TranscodeDecision | undefined {
	const missing: string[] = [];
	for (const [key, wanted] of Object.entries(expected)) {
		if (wanted === undefined) continue;
		const observed = actual[key as keyof TransformSignalEvidence];
		if (observed === undefined || observed === null || observed === "") {
			missing.push(key);
			continue;
		}
		const equal =
			typeof wanted === "string"
				? String(observed).trim().toLowerCase() === wanted
				: observed === wanted;
		if (!equal) {
			return transcodeVerdict(
				"FAIL",
				"TRANSCODE_TRANSFORM_SIGNALING_MISMATCH",
				`authored ${key}=${String(observed)}; expected ${String(wanted)}`,
			);
		}
	}
	if (missing.length) {
		return transcodeUnavailable(
			"NA_ASSET",
			"TRANSCODE_TRANSFORM_SIGNALING_UNAVAILABLE",
			`independent reader did not expose authored ${missing.join(", ")}`,
		);
	}
	return undefined;
}

type SignalReadState = Exclude<TransformSignalReadResult["state"], "OK">;

class TransformSignalReadError extends Error {
	constructor(
		readonly state: SignalReadState,
		readonly reasonCode: string,
		message: string,
	) {
		super(message);
		this.name = "TransformSignalReadError";
	}
}

function signalReadProblem(
	state: SignalReadState,
	reasonCode: string,
	detail: string,
): TransformSignalReadResult {
	return Object.freeze({ state, reasonCode, detail });
}

function canonicalSignalContainer(value: string | undefined): string {
	const token = (value ?? "").trim().toLowerCase();
	if (token === "m4a" || token === "m4v" || token === "isobmff") return "mp4";
	if (token === "matroska") return "mkv";
	return token;
}

function looksLikeIsoBmff(bytes: Uint8Array): boolean {
	return bytes.byteLength >= 12 && signalAscii(bytes, 4, 4) === "ftyp";
}

function looksLikeEbml(bytes: Uint8Array): boolean {
	return (
		bytes.byteLength >= 4 &&
		bytes[0] === 0x1a &&
		bytes[1] === 0x45 &&
		bytes[2] === 0xdf &&
		bytes[3] === 0xa3
	);
}

interface SignalIsoBox {
	readonly type: string;
	readonly start: number;
	readonly bodyStart: number;
	readonly end: number;
}

interface H273ColorTuple {
	readonly primaries: number;
	readonly transfer: number;
	readonly matrix: number;
	readonly fullRange: boolean;
}

interface AvcSpsSignal {
	readonly bitDepth: number;
	readonly color: H273ColorTuple | undefined;
}

function readIsoBmffTransformSignal(
	bytes: Uint8Array,
	container: "mp4" | "mov",
): TransformSignalReadResult {
	const moov = signalIsoBoxes(bytes, 0, bytes.byteLength).find(
		(box) => box.type === "moov",
	);
	if (!moov) {
		return signalReadProblem(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_MOOV_MISSING",
			"ISO BMFF has no moov box",
		);
	}
	let sampleEntry: SignalIsoBox | undefined;
	for (const trak of signalIsoBoxes(bytes, moov.bodyStart, moov.end).filter(
		(box) => box.type === "trak",
	)) {
		const mdia = signalIsoBoxes(bytes, trak.bodyStart, trak.end).find(
			(box) => box.type === "mdia",
		);
		if (!mdia) continue;
		const mdiaChildren = signalIsoBoxes(bytes, mdia.bodyStart, mdia.end);
		const hdlr = mdiaChildren.find((box) => box.type === "hdlr");
		if (
			!hdlr ||
			hdlr.bodyStart + 12 > hdlr.end ||
			signalAscii(bytes, hdlr.bodyStart + 8, 4) !== "vide"
		)
			continue;
		const minf = mdiaChildren.find((box) => box.type === "minf");
		const stbl =
			minf &&
			signalIsoBoxes(bytes, minf.bodyStart, minf.end).find(
				(box) => box.type === "stbl",
			);
		const stsd =
			stbl &&
			signalIsoBoxes(bytes, stbl.bodyStart, stbl.end).find(
				(box) => box.type === "stsd",
			);
		if (stsd && stsd.bodyStart + 8 <= stsd.end) {
			sampleEntry = signalIsoBoxes(bytes, stsd.bodyStart + 8, stsd.end)[0];
		}
		break;
	}
	if (!sampleEntry) {
		return signalReadProblem(
			"UNSUPPORTED_STRUCTURE",
			"TRANSCODE_TRANSFORM_SIGNAL_VIDEO_ENTRY_MISSING",
			"ISO BMFF has no readable video sample entry",
		);
	}

	const orientation = readMuxOrientation(bytes, container);
	if (orientation.state !== "OK") {
		return signalReadProblem(
			orientation.state,
			orientation.reasonCode,
			`ISO BMFF orientation signaling is unreadable: ${orientation.detail}`,
		);
	}
	const signal: MutableTransformSignalEvidence = {
		rotationDegrees: orientation.value.rotationDegrees,
	};
	const childStart = sampleEntry.bodyStart + 78;
	if (childStart > sampleEntry.end) {
		return signalReadProblem(
			"INCOMPLETE",
			"TRANSCODE_TRANSFORM_SIGNAL_VIDEO_ENTRY_TRUNCATED",
			"ISO BMFF visual sample entry is shorter than its fixed header",
		);
	}
	const children = signalIsoBoxes(bytes, childStart, sampleEntry.end);
	const colrBoxes = children.filter((box) => box.type === "colr");
	if (
		colrBoxes.length > 1 &&
		(sampleEntry.type === "avc1" || sampleEntry.type === "avc3")
	) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_COLR_AMBIGUOUS",
			"H.264 sample entry carries multiple colr declarations",
		);
	}
	const colr = colrBoxes[0];
	if (colr) Object.assign(signal, readIsoColrSignal(bytes, colr));
	let bitDepth: number | undefined;
	if (sampleEntry.type === "avc3") {
		throw new TransformSignalReadError(
			"UNSUPPORTED_STRUCTURE",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_INBAND_PARAMETER_SETS",
			"avc3 may replace avcC parameter sets in-band, so elementary colour signaling cannot be proven",
		);
	}
	if (sampleEntry.type === "avc1") {
		const avcCBoxes = children.filter((box) => box.type === "avcC");
		if (avcCBoxes.length === 0) {
			throw new TransformSignalReadError(
				"MALFORMED",
				"TRANSCODE_TRANSFORM_SIGNAL_H264_AVCC_MISSING",
				"avc1 sample entry has no AVCDecoderConfigurationRecord",
			);
		}
		if (avcCBoxes.length > 1) {
			throw new TransformSignalReadError(
				"MALFORMED",
				"TRANSCODE_TRANSFORM_SIGNAL_H264_AVCC_AMBIGUOUS",
				"avc1 sample entry carries multiple AVCDecoderConfigurationRecords",
			);
		}
		const avcC = avcCBoxes[0]!;
		const spsSignals = readAvcSpsSignals(
			bytes.subarray(avcC.bodyStart, avcC.end),
		);
		bitDepth = uniqueAvcBitDepth(spsSignals);
		reconcileAvc1ColorSignal(
			spsSignals,
			colr ? readIsoNclxTuple(bytes, colr) : undefined,
		);
	} else {
		bitDepth = readIsoCodecBitDepth(bytes, sampleEntry.type, children);
	}
	if (bitDepth !== undefined) Object.assign(signal, { bitDepth });
	return Object.freeze({
		state: "OK",
		value: Object.freeze(signal),
		reader: "isobmff-video-signal",
	});
}

function signalIsoBoxes(
	bytes: Uint8Array,
	start: number,
	end: number,
): SignalIsoBox[] {
	const boxes: SignalIsoBox[] = [];
	let offset = start;
	while (offset < end) {
		if (offset + 8 > end) {
			if (end - offset === 0) break;
			throw new TransformSignalReadError(
				"INCOMPLETE",
				"TRANSCODE_TRANSFORM_SIGNAL_BOX_HEADER_TRUNCATED",
				`ISO BMFF box header is truncated at byte ${offset}`,
			);
		}
		const size32 = signalU32(bytes, offset);
		const type = signalAscii(bytes, offset + 4, 4);
		let size = size32;
		let header = 8;
		if (size32 === 1) {
			if (offset + 16 > end) {
				throw new TransformSignalReadError(
					"INCOMPLETE",
					"TRANSCODE_TRANSFORM_SIGNAL_LARGE_BOX_TRUNCATED",
					`ISO BMFF large-size box '${type}' is truncated`,
				);
			}
			size = signalU64Safe(bytes, offset + 8);
			header = 16;
		} else if (size32 === 0) {
			size = end - offset;
		}
		if (!Number.isSafeInteger(size) || size < header || offset + size > end) {
			throw new TransformSignalReadError(
				offset + Math.max(size, 0) > end ? "INCOMPLETE" : "MALFORMED",
				"TRANSCODE_TRANSFORM_SIGNAL_BOX_SIZE_INVALID",
				`ISO BMFF box '${type}' has invalid size ${String(size)}`,
			);
		}
		boxes.push({
			type,
			start: offset,
			bodyStart: offset + header,
			end: offset + size,
		});
		offset += size;
	}
	return boxes;
}

function readIsoColrSignal(
	bytes: Uint8Array,
	box: SignalIsoBox,
): TransformSignalEvidence {
	if (box.bodyStart + 10 > box.end) {
		throw new TransformSignalReadError(
			"INCOMPLETE",
			"TRANSCODE_TRANSFORM_SIGNAL_COLR_TRUNCATED",
			"ISO BMFF colr box is truncated",
		);
	}
	const kind = signalAscii(bytes, box.bodyStart, 4);
	if (kind !== "nclx" && kind !== "nclc") return {};
	const primaries = mapColorPrimaries(signalU16(bytes, box.bodyStart + 4));
	const transfer = mapTransfer(signalU16(bytes, box.bodyStart + 6));
	const matrix = mapMatrix(signalU16(bytes, box.bodyStart + 8));
	return {
		...(primaries ? { colorPrimaries: primaries } : {}),
		...(transfer ? { transfer } : {}),
		...(matrix ? { matrix } : {}),
		...(kind === "nclx" && box.bodyStart + 11 <= box.end
			? {
					range: (bytes[box.bodyStart + 10]! & 0x80) !== 0 ? "full" : "limited",
				}
			: {}),
	};
}

function readIsoNclxTuple(
	bytes: Uint8Array,
	box: SignalIsoBox,
): H273ColorTuple | undefined {
	if (signalAscii(bytes, box.bodyStart, 4) !== "nclx") return undefined;
	if (box.bodyStart + 11 > box.end) {
		throw new TransformSignalReadError(
			"INCOMPLETE",
			"TRANSCODE_TRANSFORM_SIGNAL_NCLX_TRUNCATED",
			"H.264 nclx declaration is missing its range byte",
		);
	}
	return {
		primaries: signalU16(bytes, box.bodyStart + 4),
		transfer: signalU16(bytes, box.bodyStart + 6),
		matrix: signalU16(bytes, box.bodyStart + 8),
		fullRange: (bytes[box.bodyStart + 10]! & 0x80) !== 0,
	};
}

function readIsoCodecBitDepth(
	bytes: Uint8Array,
	sampleEntry: string,
	children: readonly SignalIsoBox[],
): number | undefined {
	if (sampleEntry === "avc1" || sampleEntry === "avc3") {
		const avcC = children.find((box) => box.type === "avcC");
		return avcC
			? readAvcBitDepth(bytes.subarray(avcC.bodyStart, avcC.end))
			: undefined;
	}
	if (sampleEntry === "hvc1" || sampleEntry === "hev1") {
		const hvcC = children.find((box) => box.type === "hvcC");
		return hvcC
			? readHevcBitDepth(bytes.subarray(hvcC.bodyStart, hvcC.end))
			: undefined;
	}
	if (sampleEntry === "vp08" || sampleEntry === "vp09") {
		const vpcC = children.find((box) => box.type === "vpcC");
		const packed = vpcC && bytes[vpcC.bodyStart + 6];
		const bitDepth = packed === undefined ? undefined : packed >> 4;
		return bitDepth && bitDepth >= 8 ? bitDepth : undefined;
	}
	if (sampleEntry === "av01") {
		const av1C = children.find((box) => box.type === "av1C");
		const flags = av1C && bytes[av1C.bodyStart + 2];
		if (flags === undefined) return undefined;
		const highBitDepth = (flags & 0x40) !== 0;
		const twelveBit = (flags & 0x20) !== 0;
		return twelveBit ? 12 : highBitDepth ? 10 : 8;
	}
	return undefined;
}

function readAvcBitDepth(avcC: Uint8Array): number | undefined {
	if (avcC.byteLength < 8 || avcC[0] !== 1) return undefined;
	const spsCount = avcC[5]! & 0x1f;
	let offset = 6;
	for (let index = 0; index < spsCount; index++) {
		if (offset + 2 > avcC.byteLength) return undefined;
		const length = signalU16(avcC, offset);
		offset += 2;
		if (length <= 1 || offset + length > avcC.byteLength) return undefined;
		const nal = avcC.subarray(offset, offset + length);
		offset += length;
		if ((nal[0]! & 0x1f) !== 7) continue;
		const bits = new SignalBitReader(
			removeEmulationPrevention(nal.subarray(1)),
		);
		const profile = bits.readBits(8);
		bits.skip(16);
		bits.readUe();
		if (
			![100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(
				profile,
			)
		)
			return 8;
		const chromaFormat = bits.readUe();
		if (chromaFormat === 3) bits.skip(1);
		return 8 + bits.readUe();
	}
	return undefined;
}

function readAvcSpsSignals(avcC: Uint8Array): readonly AvcSpsSignal[] {
	if (avcC.byteLength < 7 || avcC[0] !== 1) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_AVCC_INVALID",
			"AVCDecoderConfigurationRecord is missing or invalid",
		);
	}
	const spsCount = avcC[5]! & 0x1f;
	if (spsCount === 0) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_MISSING",
			"AVCDecoderConfigurationRecord contains no SPS",
		);
	}
	const signals: AvcSpsSignal[] = [];
	let offset = 6;
	for (let index = 0; index < spsCount; index++) {
		if (offset + 2 > avcC.byteLength) {
			throw new TransformSignalReadError(
				"INCOMPLETE",
				"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_LENGTH_TRUNCATED",
				`avcC SPS ${index} length is truncated`,
			);
		}
		const length = signalU16(avcC, offset);
		offset += 2;
		if (length <= 1 || offset + length > avcC.byteLength) {
			throw new TransformSignalReadError(
				"INCOMPLETE",
				"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_TRUNCATED",
				`avcC SPS ${index} payload is truncated`,
			);
		}
		signals.push(
			readAvcSpsSignal(avcC.subarray(offset, offset + length), index),
		);
		offset += length;
	}
	return signals;
}

function uniqueAvcBitDepth(signals: readonly AvcSpsSignal[]): number {
	const depths = new Set(signals.map((signal) => signal.bitDepth));
	if (depths.size !== 1) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_DEPTH_CONFLICT",
			"avcC SPS entries disagree on coded bit depth",
		);
	}
	return signals[0]!.bitDepth;
}

function reconcileAvc1ColorSignal(
	signals: readonly AvcSpsSignal[],
	nclx: H273ColorTuple | undefined,
): void {
	const colors = signals.map((signal) => signal.color);
	const declared = colors.filter(
		(color): color is H273ColorTuple => color !== undefined,
	);
	if (declared.length > 0 && declared.length !== colors.length) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_AMBIGUOUS",
			"only some avcC SPS entries carry a complete VUI colour declaration",
		);
	}
	if (
		declared.length > 1 &&
		declared.some((color) => !h273ColorTupleEqual(color, declared[0]!))
	) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_CONFLICT",
			"avcC SPS entries carry conflicting VUI colour declarations",
		);
	}
	if (nclx === undefined) return;
	if (declared.length === 0) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_COLOR_MISSING",
			"nclx declares H.264 colour but no avcC SPS carries a complete VUI colour tuple",
		);
	}
	if (!h273ColorTupleEqual(declared[0]!, nclx)) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_NCLX_SPS_CONFLICT",
			"H.264 avcC SPS VUI colour tuple disagrees with the nclx declaration",
		);
	}
}

function h273ColorTupleEqual(
	left: H273ColorTuple,
	right: H273ColorTuple,
): boolean {
	return (
		left.primaries === right.primaries &&
		left.transfer === right.transfer &&
		left.matrix === right.matrix &&
		left.fullRange === right.fullRange
	);
}

function readAvcSpsSignal(nal: Uint8Array, index: number): AvcSpsSignal {
	if (nal.byteLength < 4 || (nal[0]! & 0x1f) !== 7) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_SPS_NAL_INVALID",
			`avcC SPS ${index} is not an SPS NAL unit`,
		);
	}
	const bits = new SignalBitReader(removeEmulationPrevention(nal.subarray(1)));
	const profile = bits.readBits(8);
	bits.skip(16);
	bits.readUe();
	let bitDepth = 8;
	if (H264_HIGH_PROFILES.has(profile)) {
		const chromaFormat = bits.readUe();
		if (chromaFormat > 3) {
			throw new TransformSignalReadError(
				"MALFORMED",
				"TRANSCODE_TRANSFORM_SIGNAL_H264_CHROMA_FORMAT_INVALID",
				`H.264 SPS has invalid chroma_format_idc ${chromaFormat}`,
			);
		}
		if (chromaFormat === 3) bits.skip(1);
		bitDepth += bits.readUe();
		bits.readUe();
		bits.skip(1);
		if (bits.readBits(1) === 1) {
			const count = chromaFormat === 3 ? 12 : 8;
			for (let scaling = 0; scaling < count; scaling++) {
				if (bits.readBits(1) === 1)
					skipAvcScalingList(bits, scaling < 6 ? 16 : 64);
			}
		}
	}
	bits.readUe();
	const picOrderCountType = bits.readUe();
	if (picOrderCountType === 0) bits.readUe();
	else if (picOrderCountType === 1) {
		bits.skip(1);
		bits.readSe();
		bits.readSe();
		const cycle = bits.readUe();
		for (let item = 0; item < cycle; item++) bits.readSe();
	} else if (picOrderCountType !== 2) {
		throw new TransformSignalReadError(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_H264_POC_INVALID",
			`H.264 SPS has invalid pic_order_cnt_type ${picOrderCountType}`,
		);
	}
	bits.readUe();
	bits.skip(1);
	bits.readUe();
	bits.readUe();
	const frameMbsOnly = bits.readBits(1);
	if (frameMbsOnly === 0) bits.skip(1);
	bits.skip(1);
	if (bits.readBits(1) === 1) {
		bits.readUe();
		bits.readUe();
		bits.readUe();
		bits.readUe();
	}
	if (bits.readBits(1) === 0) return { bitDepth, color: undefined };
	if (bits.readBits(1) === 1) {
		const aspectRatio = bits.readBits(8);
		if (aspectRatio === 255) bits.skip(32);
	}
	if (bits.readBits(1) === 1) bits.skip(1);
	if (bits.readBits(1) === 0) return { bitDepth, color: undefined };
	bits.skip(3);
	const fullRange = bits.readBits(1) === 1;
	if (bits.readBits(1) === 0) return { bitDepth, color: undefined };
	return {
		bitDepth,
		color: {
			primaries: bits.readBits(8),
			transfer: bits.readBits(8),
			matrix: bits.readBits(8),
			fullRange,
		},
	};
}

const H264_HIGH_PROFILES = new Set([
	44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244,
]);

function skipAvcScalingList(bits: SignalBitReader, size: number): void {
	let lastScale = 8;
	let nextScale = 8;
	for (let index = 0; index < size; index++) {
		if (nextScale !== 0) nextScale = (lastScale + bits.readSe() + 256) % 256;
		lastScale = nextScale === 0 ? lastScale : nextScale;
	}
}

function readHevcBitDepth(hvcC: Uint8Array): number | undefined {
	// HEVCDecoderConfigurationRecord carries bit_depth_luma_minus8 directly in the low three bits of
	// byte 17. Reading that normative field is both stricter and less failure-prone than reparsing SPS.
	if (hvcC.byteLength < 18 || hvcC[0] !== 1) return undefined;
	return 8 + (hvcC[17]! & 0x07);
}

class SignalBitReader {
	private offset = 0;

	constructor(private readonly bytes: Uint8Array) {}

	readBits(count: number): number {
		if (
			!Number.isSafeInteger(count) ||
			count < 0 ||
			count > 32 ||
			this.offset + count > this.bytes.byteLength * 8
		) {
			throw new TransformSignalReadError(
				"INCOMPLETE",
				"TRANSCODE_TRANSFORM_SIGNAL_CODEC_CONFIG_TRUNCATED",
				"codec configuration ended while reading transform signaling",
			);
		}
		let value = 0;
		for (let index = 0; index < count; index++) {
			const byte = this.bytes[this.offset >> 3]!;
			value = value * 2 + ((byte >> (7 - (this.offset & 7))) & 1);
			this.offset++;
		}
		return value;
	}

	skip(count: number): void {
		this.readBits(count);
	}

	readUe(): number {
		let zeros = 0;
		while (this.readBits(1) === 0) {
			zeros++;
			if (zeros > 31) {
				throw new TransformSignalReadError(
					"MALFORMED",
					"TRANSCODE_TRANSFORM_SIGNAL_GOLOMB_INVALID",
					"codec configuration contains an invalid Exp-Golomb value",
				);
			}
		}
		return zeros === 0 ? 0 : 2 ** zeros - 1 + this.readBits(zeros);
	}

	readSe(): number {
		const code = this.readUe();
		return code % 2 === 1 ? (code + 1) / 2 : -(code / 2);
	}
}

function removeEmulationPrevention(bytes: Uint8Array): Uint8Array {
	const output: number[] = [];
	for (let index = 0; index < bytes.byteLength; index++) {
		if (
			index >= 2 &&
			bytes[index] === 0x03 &&
			bytes[index - 1] === 0x00 &&
			bytes[index - 2] === 0x00
		)
			continue;
		output.push(bytes[index]!);
	}
	return Uint8Array.from(output);
}

interface SignalEbmlElement {
	readonly id: number;
	readonly bodyStart: number;
	readonly bodyEnd: number;
}

function readMatroskaTransformSignal(
	bytes: Uint8Array,
	container: "webm" | "mkv",
): TransformSignalReadResult {
	const segment = signalEbmlChildren(bytes, 0, bytes.byteLength).find(
		(element) => element.id === 0x18538067,
	);
	if (!segment) {
		return signalReadProblem(
			"MALFORMED",
			"TRANSCODE_TRANSFORM_SIGNAL_SEGMENT_MISSING",
			"Matroska has no Segment",
		);
	}
	const tracks = signalEbmlChildren(
		bytes,
		segment.bodyStart,
		segment.bodyEnd,
	).find((element) => element.id === 0x1654ae6b);
	if (!tracks) {
		return signalReadProblem(
			"UNSUPPORTED_STRUCTURE",
			"TRANSCODE_TRANSFORM_SIGNAL_TRACKS_MISSING",
			"Matroska has no readable Tracks element",
		);
	}
	let video: SignalEbmlElement | undefined;
	for (const entry of signalEbmlChildren(
		bytes,
		tracks.bodyStart,
		tracks.bodyEnd,
	).filter((item) => item.id === 0xae)) {
		const type = signalEbmlChildren(bytes, entry.bodyStart, entry.bodyEnd).find(
			(item) => item.id === 0x83,
		);
		if (type && signalUnsignedBe(bytes, type.bodyStart, type.bodyEnd) === 1) {
			video = entry;
			break;
		}
	}
	if (!video) {
		return signalReadProblem(
			"UNSUPPORTED_STRUCTURE",
			"TRANSCODE_TRANSFORM_SIGNAL_VIDEO_TRACK_MISSING",
			"Matroska has no readable video TrackEntry",
		);
	}
	const orientation = readMuxOrientation(bytes, container);
	if (orientation.state !== "OK") {
		return signalReadProblem(
			orientation.state,
			orientation.reasonCode,
			`Matroska orientation signaling is unreadable: ${orientation.detail}`,
		);
	}
	const signal: MutableTransformSignalEvidence = {
		rotationDegrees: orientation.value.rotationDegrees,
	};
	const fields = signalEbmlChildren(bytes, video.bodyStart, video.bodyEnd);
	const videoSettings = fields.find((item) => item.id === 0xe0);
	if (videoSettings) {
		const videoFields = signalEbmlChildren(
			bytes,
			videoSettings.bodyStart,
			videoSettings.bodyEnd,
		);
		const alpha = videoFields.find((item) => item.id === 0x53c0);
		if (alpha)
			signal.alphaMode =
				signalUnsignedBe(bytes, alpha.bodyStart, alpha.bodyEnd) === 1
					? "straight"
					: "opaque";
		const colour = videoFields.find((item) => item.id === 0x55b0);
		if (colour) {
			const colorFields = signalEbmlChildren(
				bytes,
				colour.bodyStart,
				colour.bodyEnd,
			);
			const matrix = signalEbmlUnsigned(bytes, colorFields, 0x55b1);
			const bits = signalEbmlUnsigned(bytes, colorFields, 0x55b2);
			const range = signalEbmlUnsigned(bytes, colorFields, 0x55b9);
			const transfer = signalEbmlUnsigned(bytes, colorFields, 0x55ba);
			const primaries = signalEbmlUnsigned(bytes, colorFields, 0x55bb);
			const mappedPrimaries = mapColorPrimaries(primaries);
			const mappedTransfer = mapTransfer(transfer);
			const mappedMatrix = mapMatrix(matrix);
			if (mappedPrimaries) signal.colorPrimaries = mappedPrimaries;
			if (mappedTransfer) signal.transfer = mappedTransfer;
			if (mappedMatrix) signal.matrix = mappedMatrix;
			if (range === 1) signal.range = "limited";
			else if (range === 2) signal.range = "full";
			if (Number.isSafeInteger(bits) && bits! >= 8 && bits! <= 16)
				signal.bitDepth = bits;
		}
	}
	return Object.freeze({
		state: "OK",
		value: Object.freeze(signal),
		reader: "matroska-video-signal",
	});
}

function signalEbmlChildren(
	bytes: Uint8Array,
	start: number,
	end: number,
): SignalEbmlElement[] {
	const output: SignalEbmlElement[] = [];
	let offset = start;
	while (offset < end) {
		const id = signalEbmlVint(bytes, offset, true);
		if (!id) break;
		const size = signalEbmlVint(bytes, id.next, false);
		if (!size) break;
		const bodyStart = size.next;
		const bodyEnd = size.unknown ? end : bodyStart + size.value;
		if (bodyStart > end || bodyEnd > end || bodyEnd < bodyStart) {
			throw new TransformSignalReadError(
				"INCOMPLETE",
				"TRANSCODE_TRANSFORM_SIGNAL_EBML_ELEMENT_TRUNCATED",
				`EBML element 0x${id.value.toString(16)} exceeds its parent`,
			);
		}
		output.push({ id: id.value, bodyStart, bodyEnd });
		if (bodyEnd <= offset) break;
		offset = bodyEnd;
	}
	return output;
}

function signalEbmlVint(
	bytes: Uint8Array,
	offset: number,
	keepMarker: boolean,
): { value: number; next: number; unknown: boolean } | undefined {
	const first = bytes[offset];
	if (first === undefined || first === 0) return undefined;
	let marker = 0x80;
	let length = 1;
	while (length <= 8 && (first & marker) === 0) {
		marker >>= 1;
		length++;
	}
	if (length > 8 || offset + length > bytes.byteLength) return undefined;
	let value = keepMarker ? first : first & (marker - 1);
	for (let index = 1; index < length; index++)
		value = value * 256 + bytes[offset + index]!;
	const unknown = !keepMarker && value === 2 ** (7 * length) - 1;
	return { value, next: offset + length, unknown };
}

function signalEbmlUnsigned(
	bytes: Uint8Array,
	fields: readonly SignalEbmlElement[],
	id: number,
): number | undefined {
	const field = fields.find((item) => item.id === id);
	return field
		? signalUnsignedBe(bytes, field.bodyStart, field.bodyEnd)
		: undefined;
}

function signalUnsignedBe(
	bytes: Uint8Array,
	start: number,
	end: number,
): number {
	if (start >= end || end - start > 7) return Number.NaN;
	let value = 0;
	for (let offset = start; offset < end; offset++)
		value = value * 256 + bytes[offset]!;
	return value;
}

function mapColorPrimaries(
	value: number | undefined,
): ColorPrimaries | undefined {
	if (value === 1) return "bt709";
	if (value === 9) return "bt2020";
	return undefined;
}

function mapTransfer(
	value: number | undefined,
): TransferCharacteristic | undefined {
	if (value === 1 || value === 6) return "bt709";
	if (value === 14 || value === 15) return "bt2020-10";
	if (value === 16) return "pq";
	return undefined;
}

function mapMatrix(value: number | undefined): MatrixCoefficient | undefined {
	if (value === 0) return "rgb";
	if (value === 1 || value === 6) return "bt709";
	if (value === 9) return "bt2020-ncl";
	return undefined;
}

function signalAscii(
	bytes: Uint8Array,
	offset: number,
	length: number,
): string {
	let output = "";
	for (let index = 0; index < length; index++)
		output += String.fromCharCode(bytes[offset + index] ?? 0);
	return output;
}

function signalU16(bytes: Uint8Array, offset: number): number {
	return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function signalU32(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] ?? 0) * 0x1000000 +
			((bytes[offset + 1] ?? 0) << 16) +
			((bytes[offset + 2] ?? 0) << 8) +
			(bytes[offset + 3] ?? 0)) >>>
		0
	);
}

function signalU64Safe(bytes: Uint8Array, offset: number): number {
	const high = signalU32(bytes, offset);
	const low = signalU32(bytes, offset + 4);
	const value = high * 2 ** 32 + low;
	if (!Number.isSafeInteger(value)) {
		throw new TransformSignalReadError(
			"UNSUPPORTED_STRUCTURE",
			"TRANSCODE_TRANSFORM_SIGNAL_BOX_SIZE_UNSAFE",
			"ISO BMFF box size exceeds JavaScript safe-integer addressing",
		);
	}
	return value;
}

function matchEffectFrames(
	sourceInput: readonly TranscodePixelFrame[],
	candidateInput: readonly TranscodePixelFrame[],
	toleranceUs: number,
): Array<{ source: TranscodePixelFrame; candidate: TranscodePixelFrame }> {
	const source = [...sourceInput].sort((a, b) => a.ptsUs - b.ptsUs);
	const candidate = [...candidateInput].sort((a, b) => a.ptsUs - b.ptsUs);
	for (const frame of [...source, ...candidate]) validateFrame(frame);
	for (const timeline of [source, candidate]) {
		if (
			timeline.some(
				(frame, index) =>
					index > 0 && frame.ptsUs <= timeline[index - 1]!.ptsUs,
			)
		) {
			throw new TypeError(
				"transform frame PTS values must be strictly increasing",
			);
		}
	}
	const fallbackDuration =
		medianPositive(
			source.map(
				(frame, index) =>
					frame.durationUs ??
					(source[index + 1] ? source[index + 1]!.ptsUs - frame.ptsUs : 0),
			),
		) || 1;
	const pairs: Array<{
		source: TranscodePixelFrame;
		candidate: TranscodePixelFrame;
	}> = [];
	for (const got of candidate) {
		// Prefer an exact/request-anchor match before interval containment. With a positive tolerance,
		// the preceding frame's half-open interval otherwise overlaps the next frame's exact PTS and
		// systematically shifts every candidate after frame zero backward by one sample.
		const nearest = source
			.map((frame) => ({ frame, delta: Math.abs(frame.ptsUs - got.ptsUs) }))
			.sort((a, b) => a.delta - b.delta || a.frame.ptsUs - b.frame.ptsUs)[0];
		if (nearest && nearest.delta <= toleranceUs) {
			pairs.push({ source: nearest.frame, candidate: got });
			continue;
		}
		const containing = source.find((frame, index) => {
			const duration =
				frame.durationUs ??
				(source[index + 1]?.ptsUs ?? frame.ptsUs + fallbackDuration) -
					frame.ptsUs;
			return (
				got.ptsUs >= frame.ptsUs - toleranceUs &&
				got.ptsUs < frame.ptsUs + duration + toleranceUs
			);
		});
		if (containing) {
			pairs.push({ source: containing, candidate: got });
			continue;
		}
		if (
			nearest &&
			nearest.delta <= Math.max(toleranceUs, fallbackDuration / 2)
		) {
			pairs.push({ source: nearest.frame, candidate: got });
		}
	}
	return pairs;
}

function validateFrame(frame: TranscodePixelFrame): void {
	if (!Number.isSafeInteger(frame.ptsUs))
		throw new TypeError("transform frame PTS must be a safe integer");
	if (
		frame.durationUs !== undefined &&
		(!Number.isSafeInteger(frame.durationUs) || frame.durationUs <= 0)
	) {
		throw new TypeError(
			"transform frame duration must be a positive safe integer",
		);
	}
	if (
		!Number.isSafeInteger(frame.width) ||
		frame.width <= 0 ||
		!Number.isSafeInteger(frame.height) ||
		frame.height <= 0
	) {
		throw new TypeError("transform frame dimensions must be positive integers");
	}
	if (
		!Number.isSafeInteger(frame.bitDepth) ||
		frame.bitDepth < 8 ||
		frame.bitDepth > 16
	) {
		throw new TypeError("transform frame bit depth must be within 8..16");
	}
	if (frame.data.length !== frame.width * frame.height * 4) {
		throw new TypeError("transform frame RGBA plane must be tightly packed");
	}
	const maximum = 2 ** frame.bitDepth - 1;
	for (let index = 0; index < frame.data.length; index++) {
		if (frame.data[index]! > maximum)
			throw new TypeError("transform frame sample exceeds declared bit depth");
	}
}

function toFloatPlane(frame: TranscodePixelFrame): FloatPlane {
	validateFrame(frame);
	const maximum = 2 ** frame.bitDepth - 1;
	const data = new Float64Array(frame.data.length);
	for (let index = 0; index < data.length; index++)
		data[index] = clamp01(frame.data[index]! / maximum);
	return {
		width: frame.width,
		height: frame.height,
		bitDepth: frame.bitDepth,
		data,
	};
}

function fromFloatPlane(
	ptsUs: number,
	durationUs: number | undefined,
	plane: FloatPlane,
): TranscodePixelFrame {
	const maximum = 2 ** plane.bitDepth - 1;
	const data =
		plane.bitDepth <= 8
			? new Uint8Array(plane.data.length)
			: new Uint16Array(plane.data.length);
	for (let index = 0; index < data.length; index++)
		data[index] = Math.round(clamp01(plane.data[index]!) * maximum);
	return Object.freeze({
		ptsUs,
		...(durationUs !== undefined ? { durationUs } : {}),
		width: plane.width,
		height: plane.height,
		bitDepth: plane.bitDepth,
		data,
	});
}

function rotate(source: FloatPlane, degrees: 90 | 180 | 270): FloatPlane {
	const width = degrees === 180 ? source.width : source.height;
	const height = degrees === 180 ? source.height : source.width;
	const data = new Float64Array(width * height * 4);
	for (let y = 0; y < source.height; y++) {
		for (let x = 0; x < source.width; x++) {
			let dx: number;
			let dy: number;
			if (degrees === 90) {
				dx = source.height - 1 - y;
				dy = x;
			} else if (degrees === 180) {
				dx = source.width - 1 - x;
				dy = source.height - 1 - y;
			} else {
				dx = y;
				dy = source.width - 1 - x;
			}
			copyPixel(
				source.data,
				(y * source.width + x) * 4,
				data,
				(dy * width + dx) * 4,
			);
		}
	}
	return { ...source, width, height, data };
}

function flip(source: FloatPlane, axis: "horizontal" | "vertical"): FloatPlane {
	const data = new Float64Array(source.data.length);
	for (let y = 0; y < source.height; y++) {
		for (let x = 0; x < source.width; x++) {
			const dx = axis === "horizontal" ? source.width - 1 - x : x;
			const dy = axis === "vertical" ? source.height - 1 - y : y;
			copyPixel(
				source.data,
				(y * source.width + x) * 4,
				data,
				(dy * source.width + dx) * 4,
			);
		}
	}
	return { ...source, data };
}

function crop(
	source: FloatPlane,
	step: Extract<TransformStep, { kind: "crop" }>,
): FloatPlane {
	if (
		![step.x, step.y, step.width, step.height].every(Number.isSafeInteger) ||
		step.x < 0 ||
		step.y < 0 ||
		step.width <= 0 ||
		step.height <= 0 ||
		step.x + step.width > source.width ||
		step.y + step.height > source.height
	) {
		throw new TypeError("crop rectangle is outside the source plane");
	}
	const data = new Float64Array(step.width * step.height * 4);
	for (let y = 0; y < step.height; y++) {
		for (let x = 0; x < step.width; x++) {
			copyPixel(
				source.data,
				((step.y + y) * source.width + step.x + x) * 4,
				data,
				(y * step.width + x) * 4,
			);
		}
	}
	return { ...source, width: step.width, height: step.height, data };
}

function resizeBilinear(
	source: FloatPlane,
	width: number,
	height: number,
): FloatPlane {
	if (
		!Number.isSafeInteger(width) ||
		width <= 0 ||
		!Number.isSafeInteger(height) ||
		height <= 0
	) {
		throw new TypeError("resize target dimensions must be positive integers");
	}
	if (width === source.width && height === source.height) return source;
	const data = new Float64Array(width * height * 4);
	const scaleX = source.width / width;
	const scaleY = source.height / height;
	for (let y = 0; y < height; y++) {
		const sourceY = (y + 0.5) * scaleY - 0.5;
		const yFloor = Math.floor(sourceY);
		const y0 = Math.max(0, Math.min(source.height - 1, yFloor));
		const y1 = Math.max(0, Math.min(source.height - 1, yFloor + 1));
		const fy = Math.max(0, Math.min(1, sourceY - yFloor));
		for (let x = 0; x < width; x++) {
			const sourceX = (x + 0.5) * scaleX - 0.5;
			const xFloor = Math.floor(sourceX);
			const x0 = Math.max(0, Math.min(source.width - 1, xFloor));
			const x1 = Math.max(0, Math.min(source.width - 1, xFloor + 1));
			const fx = Math.max(0, Math.min(1, sourceX - xFloor));
			const targetOffset = (y * width + x) * 4;
			const topLeft = (y0 * source.width + x0) * 4;
			const topRight = (y0 * source.width + x1) * 4;
			const bottomLeft = (y1 * source.width + x0) * 4;
			const bottomRight = (y1 * source.width + x1) * 4;
			for (let channel = 0; channel < 4; channel++) {
				const topSample =
					source.data[topLeft + channel]! * (1 - fx) +
					source.data[topRight + channel]! * fx;
				const bottomSample =
					source.data[bottomLeft + channel]! * (1 - fx) +
					source.data[bottomRight + channel]! * fx;
				data[targetOffset + channel] = topSample * (1 - fy) + bottomSample * fy;
			}
		}
	}
	return { ...source, width, height, data };
}

function containPad(
	source: FloatPlane,
	step: Extract<TransformStep, { kind: "contain-pad" }>,
): FloatPlane {
	if (
		!Number.isSafeInteger(step.width) ||
		!Number.isSafeInteger(step.height) ||
		step.width <= 0 ||
		step.height <= 0
	) {
		throw new TypeError(
			"contain-pad target dimensions must be positive integers",
		);
	}
	if (
		step.color.some(
			(channel) => !Number.isFinite(channel) || channel < 0 || channel > 1,
		)
	) {
		throw new TypeError("contain-pad color channels must be normalized");
	}
	const data = new Float64Array(step.width * step.height * 4);
	for (let offset = 0; offset < data.length; offset += 4)
		data.set(step.color, offset);

	const scale = Math.min(
		step.width / source.width,
		step.height / source.height,
	);
	const drawWidth = source.width * scale;
	const drawHeight = source.height * scale;
	const left = (step.width - drawWidth) / 2;
	const top = (step.height - drawHeight) / 2;
	for (let y = 0; y < step.height; y++) {
		const centerY = y + 0.5;
		if (centerY < top || centerY >= top + drawHeight) continue;
		const sourceY = (centerY - top) / scale - 0.5;
		const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(sourceY)));
		const y1 = Math.max(0, Math.min(source.height - 1, y0 + 1));
		const fy = Math.max(0, Math.min(1, sourceY - Math.floor(sourceY)));
		for (let x = 0; x < step.width; x++) {
			const centerX = x + 0.5;
			if (centerX < left || centerX >= left + drawWidth) continue;
			const sourceX = (centerX - left) / scale - 0.5;
			const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(sourceX)));
			const x1 = Math.max(0, Math.min(source.width - 1, x0 + 1));
			const fx = Math.max(0, Math.min(1, sourceX - Math.floor(sourceX)));
			const targetOffset = (y * step.width + x) * 4;
			const topLeft = (y0 * source.width + x0) * 4;
			const topRight = (y0 * source.width + x1) * 4;
			const bottomLeft = (y1 * source.width + x0) * 4;
			const bottomRight = (y1 * source.width + x1) * 4;
			for (let channel = 0; channel < 4; channel++) {
				const topSample =
					source.data[topLeft + channel]! * (1 - fx) +
					source.data[topRight + channel]! * fx;
				const bottomSample =
					source.data[bottomLeft + channel]! * (1 - fx) +
					source.data[bottomRight + channel]! * fx;
				data[targetOffset + channel] = topSample * (1 - fy) + bottomSample * fy;
			}
		}
	}
	return { ...source, width: step.width, height: step.height, data };
}

/** Convert the neutral decoder's normalized sRGB pixels into authored video RGB coordinates. */
function convertNormalizedSrgbToPrimaries(
	source: FloatPlane,
	to: ColorPrimaries,
): FloatPlane {
	const data = source.data.slice();
	for (let offset = 0; offset < data.length; offset += 4) {
		const linear = [
			inverseSrgbOetf(data[offset] ?? 0),
			inverseSrgbOetf(data[offset + 1] ?? 0),
			inverseSrgbOetf(data[offset + 2] ?? 0),
		] as const;
		// sRGB and BT.709 share D65 primaries; only their transfer functions differ.
		const xyz = multiply3(RGB_TO_XYZ.bt709, linear);
		const converted = multiply3(XYZ_TO_RGB[to], xyz);
		data[offset] = btOetf(converted[0]);
		data[offset + 1] = btOetf(converted[1]);
		data[offset + 2] = btOetf(converted[2]);
	}
	return { ...source, data };
}

function colorTargetForContract(
	contract: TranscodeTransformContract,
): ColorPrimaries | undefined {
	let colorTarget: ColorPrimaries | undefined;
	for (const step of contract.steps) {
		if (step.kind === "color-convert") colorTarget = step.to;
	}
	return colorTarget;
}

/**
 * Independently synthesize the decoded-sRGB appearance of a signal-only retag. The input normalized-sRGB
 * numbers are treated as target-coded BT.709/BT.2020 values without conversion, then decoded through the
 * target transfer/primaries into the neutral reader's sRGB presentation space. This is the semantic 0%
 * endpoint; the original normalized-sRGB source is the presentation-preserved 100% endpoint.
 */
function rawColorRetagPresentation(
	source: FloatPlane,
	target: ColorPrimaries,
): FloatPlane {
	const data = source.data.slice();
	for (let offset = 0; offset < data.length; offset += 4) {
		const targetLinear = [
			inverseBtOetf(data[offset] ?? 0),
			inverseBtOetf(data[offset + 1] ?? 0),
			inverseBtOetf(data[offset + 2] ?? 0),
		] as const;
		const xyz = multiply3(RGB_TO_XYZ[target], targetLinear);
		const displayLinear = multiply3(XYZ_TO_RGB.bt709, xyz);
		data[offset] = srgbOetf(displayLinear[0]);
		data[offset + 1] = srgbOetf(displayLinear[1]);
		data[offset + 2] = srgbOetf(displayLinear[2]);
	}
	return { ...source, data };
}

function normalizedSrgbToneMapPresentation(
	source: FloatPlane,
	targetPeakNits: number,
): FloatPlane {
	if (!Number.isFinite(targetPeakNits) || targetPeakNits <= 0)
		throw new TypeError("tone-map peak must be positive");
	return { ...source, bitDepth: 8, data: source.data.slice() };
}

function quantize(source: FloatPlane, bitDepth: number): FloatPlane {
	if (!Number.isSafeInteger(bitDepth) || bitDepth < 8 || bitDepth > 16) {
		throw new TypeError("target bit depth must be within 8..16");
	}
	const maximum = 2 ** bitDepth - 1;
	const data = source.data.slice();
	for (let index = 0; index < data.length; index++)
		data[index] = Math.round(clamp01(data[index]!) * maximum) / maximum;
	return { ...source, bitDepth, data };
}

function validateSignal(signal: TransformSignalExpectation): void {
	if (
		signal.bitDepth !== undefined &&
		(!Number.isSafeInteger(signal.bitDepth) ||
			signal.bitDepth < 8 ||
			signal.bitDepth > 16)
	) {
		throw new TypeError("authored transform bit depth must be within 8..16");
	}
}

function validateStep(step: TransformStep): void {
	if (
		step.kind === "resize" &&
		(!Number.isSafeInteger(step.width) ||
			step.width <= 0 ||
			!Number.isSafeInteger(step.height) ||
			step.height <= 0)
	) {
		throw new TypeError("resize contract dimensions must be positive integers");
	}
	if (
		step.kind === "crop" &&
		![step.x, step.y, step.width, step.height].every(Number.isSafeInteger)
	) {
		throw new TypeError("crop contract values must be integers");
	}
	if (
		step.kind === "contain-pad" &&
		(!Number.isSafeInteger(step.width) || !Number.isSafeInteger(step.height))
	) {
		throw new TypeError("contain-pad contract dimensions must be integers");
	}
	if (
		step.kind === "depth-convert" &&
		(![step.fromBitDepth, step.toBitDepth].every(Number.isSafeInteger) ||
			step.fromBitDepth < 8 ||
			step.fromBitDepth > 16 ||
			step.toBitDepth < 8 ||
			step.toBitDepth > 16)
	) {
		throw new TypeError(
			"depth contract values must be valid integer bit depths",
		);
	}
}

type Matrix3 = readonly [
	readonly [number, number, number],
	readonly [number, number, number],
	readonly [number, number, number],
];

const RGB_TO_XYZ: Readonly<Record<ColorPrimaries, Matrix3>> = {
	bt709: [
		[0.4123908, 0.3575843, 0.1804808],
		[0.212639, 0.7151687, 0.0721923],
		[0.0193308, 0.1191948, 0.9505322],
	],
	bt2020: [
		[0.636958, 0.144617, 0.168881],
		[0.2627, 0.677998, 0.059302],
		[0, 0.028073, 1.060985],
	],
};

const XYZ_TO_RGB: Readonly<Record<ColorPrimaries, Matrix3>> = {
	bt709: [
		[3.24097, -1.537383, -0.498611],
		[-0.969244, 1.875968, 0.041555],
		[0.05563, -0.203977, 1.056972],
	],
	bt2020: [
		[1.716651, -0.355671, -0.253366],
		[-0.666684, 1.616481, 0.015769],
		[0.01764, -0.042771, 0.942103],
	],
};

function multiply3(
	matrix: Matrix3,
	vector: readonly [number, number, number],
): [number, number, number] {
	return matrix.map(
		(row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2],
	) as [number, number, number];
}

function btOetf(value: number): number {
	const v = Math.max(0, value);
	return clamp01(v < 0.018 ? 4.5 * v : 1.099 * v ** 0.45 - 0.099);
}

const BT_OETF_ALPHA = 1.09929682680944;
const BT_OETF_BETA = 0.018053968510807;

function inverseBtOetf(value: number): number {
	const v = clamp01(value);
	return v < 4.5 * BT_OETF_BETA
		? v / 4.5
		: ((v + (BT_OETF_ALPHA - 1)) / BT_OETF_ALPHA) ** (1 / 0.45);
}

function srgbOetf(value: number): number {
	const v = clamp01(value);
	return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function inverseSrgbOetf(value: number): number {
	const v = clamp01(value);
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function copyPixel(
	source: Float64Array,
	sourceOffset: number,
	target: Float64Array,
	targetOffset: number,
): void {
	target[targetOffset] = source[sourceOffset]!;
	target[targetOffset + 1] = source[sourceOffset + 1]!;
	target[targetOffset + 2] = source[sourceOffset + 2]!;
	target[targetOffset + 3] = source[sourceOffset + 3]!;
}

function medianPositive(values: readonly number[]): number {
	const sorted = values
		.filter((value) => Number.isFinite(value) && value > 0)
		.sort((a, b) => a - b);
	if (!sorted.length) return 0;
	return sorted[Math.floor(sorted.length / 2)]!;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value))
		return value;
	Object.freeze(value);
	for (const nested of Object.values(value as Record<string, unknown>))
		deepFreeze(nested);
	return value;
}
