/**
 * Independent acceptance-side helpers for the public `ssim-luma-v1` quality contract.
 *
 * This module deliberately owns its sampler. It does not import the scored engine or reuse its
 * implementation, so agreement is observable contract equivalence rather than shared-code agreement.
 */

export const SSIM_LUMA_V1_METRIC = 'ssim-luma-v1' as const;

export interface SsimLumaV1QualityContract {
  readonly metric: typeof SSIM_LUMA_V1_METRIC;
  readonly minimumMean: number;
  readonly samples: number;
}

const MAX_QUALITY_SAMPLES = 256;
const DEFAULT_QUALITY_SAMPLES = 8;

/** Read the exact nested public quality contract, leaving unrelated transcodes on the generic oracle. */
export function ssimLumaV1QualityContractFromOptions(
  options: unknown,
): SsimLumaV1QualityContract | undefined {
  if (!isRecord(options) || !isRecord(options.video) || !isRecord(options.video.quality)) {
    return undefined;
  }
  const quality = options.video.quality;
  if (quality.metric !== SSIM_LUMA_V1_METRIC) return undefined;
  const samples = quality.samples ?? DEFAULT_QUALITY_SAMPLES;
  if (
    typeof quality.minimumMean !== 'number' ||
    !Number.isFinite(quality.minimumMean) ||
    quality.minimumMean < 0 ||
    quality.minimumMean > 1 ||
    typeof samples !== 'number' ||
    !Number.isSafeInteger(samples) ||
    samples < 1 ||
    samples > MAX_QUALITY_SAMPLES
  ) {
    return undefined;
  }
  return Object.freeze({
    metric: SSIM_LUMA_V1_METRIC,
    minimumMean: quality.minimumMean,
    samples,
  });
}

/**
 * Select real, unique presentation timestamps nearest endpoint-inclusive uniform targets.
 *
 * For two or more requested samples, the first and last real PTS are mandatory. For one sample,
 * the nearest real midpoint is selected. Equal-distance ties always choose the earlier PTS, while
 * bounded interior searches preserve uniqueness even on extremely irregular timelines.
 */
export function endpointInclusiveQualitySamplePts(
  timestampsUs: ArrayLike<number>,
  requestedSamples: number,
): readonly number[] {
  if (!Number.isSafeInteger(requestedSamples) || requestedSamples < 1 || requestedSamples > MAX_QUALITY_SAMPLES) {
    throw new RangeError(`quality sample count must be an integer in [1, ${MAX_QUALITY_SAMPLES}]`);
  }
  if (
    (typeof timestampsUs !== 'object' && typeof timestampsUs !== 'function') ||
    timestampsUs === null ||
    !Number.isSafeInteger(timestampsUs.length) ||
    timestampsUs.length < 0
  ) {
    throw new TypeError('quality timestamps must be an array-like sequence');
  }

  const ordered: number[] = [];
  for (let index = 0; index < timestampsUs.length; index++) {
    const ptsUs = timestampsUs[index];
    if (typeof ptsUs !== 'number' || !Number.isSafeInteger(ptsUs) || ptsUs < 0) {
      throw new TypeError('quality timestamps must be non-negative safe integers');
    }
    ordered.push(ptsUs);
  }
  ordered.sort((left, right) => left - right);
  const unique = ordered.filter((ptsUs, index) => index === 0 || ptsUs !== ordered[index - 1]);
  if (unique.length === 0) return Object.freeze([]);
  if (requestedSamples >= unique.length) return Object.freeze(unique);

  const first = unique[0]!;
  const last = unique[unique.length - 1]!;
  if (requestedSamples === 1) {
    const midpoint = first + (last - first) / 2;
    return Object.freeze([
      unique[nearestPtsIndex(unique, midpoint, 0, unique.length - 1)]!,
    ]);
  }

  const selected = [first];
  let previousIndex = 0;
  for (let slot = 1; slot < requestedSamples - 1; slot++) {
    const lowerIndex = previousIndex + 1;
    const upperIndex = unique.length - requestedSamples + slot;
    const target = first + (last - first) * slot / (requestedSamples - 1);
    const selectedIndex = nearestPtsIndex(unique, target, lowerIndex, upperIndex);
    selected.push(unique[selectedIndex]!);
    previousIndex = selectedIndex;
  }
  selected.push(last);
  return Object.freeze(selected);
}

function nearestPtsIndex(
  ordered: readonly number[],
  target: number,
  lowerIndex: number,
  upperIndex: number,
): number {
  let low = lowerIndex;
  let high = upperIndex;
  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    if (ordered[midpoint]! < target) low = midpoint + 1;
    else high = midpoint;
  }
  const laterIndex = low;
  const earlierIndex = Math.max(lowerIndex, laterIndex - 1);
  const earlierDistance = Math.abs(ordered[earlierIndex]! - target);
  const laterDistance = Math.abs(ordered[laterIndex]! - target);
  return earlierDistance <= laterDistance ? earlierIndex : laterIndex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
