import { contractError, verdict, type ProbeContractAssessment } from './types.ts';

export const PROBE_WRAPPER_EQUIVALENCE_SCHEMA = 'media-test/probe-wrapper-equivalence@1' as const;
export const PROBE_HEADERLESS_DURATION_SCHEMA = 'media-test/probe-headerless-duration@1' as const;

export interface ProbeWrapperStreamFingerprint {
  type: 'video' | 'audio' | 'subtitle' | 'other';
  codec: string;
  sha256: string;
}

export interface ProbeWrapperEvidenceEntry {
  assetId: string;
  container: string;
  streams: readonly ProbeWrapperStreamFingerprint[];
}

export interface ProbeWrapperEquivalenceEvidence {
  schema: typeof PROBE_WRAPPER_EQUIVALENCE_SCHEMA;
  groupId: string;
  wrappers: readonly ProbeWrapperEvidenceEntry[];
  generatedBy: string;
}

export interface ProbeDurationObservation {
  assetId: string;
  container: string;
  durationSec: number | null;
  goldenDurationSec: number | null;
  toleranceSec: number;
}

export interface ProbeHeaderlessDurationContract {
  schema: typeof PROBE_HEADERLESS_DURATION_SCHEMA;
  allowUnknown: true;
  /** Span of real packet/frame timestamps independently extracted from the fixture. */
  contentSpanSec: number;
  /** Last-frame/packet-duration and parser rounding allowance, never a percentage of arbitrary output. */
  tailAndRoundingAllowanceSec: number;
}

export const RECORDER_HEADERLESS_DURATION_CONTRACT: ProbeHeaderlessDurationContract = Object.freeze({
  schema: PROBE_HEADERLESS_DURATION_SCHEMA,
  allowUnknown: true,
  contentSpanSec: 2.98,
  tailAndRoundingAllowanceSec: 0.5,
});

export function parseProbeWrapperEquivalenceEvidence(value: unknown): ProbeWrapperEquivalenceEvidence | undefined {
  if (!isRecord(value) || value.schema !== PROBE_WRAPPER_EQUIVALENCE_SCHEMA || typeof value.groupId !== 'string') {
    return undefined;
  }
  if (typeof value.generatedBy !== 'string' || !Array.isArray(value.wrappers) || value.wrappers.length < 2) {
    return undefined;
  }
  const wrappers: ProbeWrapperEvidenceEntry[] = [];
  for (const wrapper of value.wrappers) {
    if (!isRecord(wrapper) || typeof wrapper.assetId !== 'string' || typeof wrapper.container !== 'string' || !Array.isArray(wrapper.streams)) {
      return undefined;
    }
    const streams: ProbeWrapperStreamFingerprint[] = [];
    for (const stream of wrapper.streams) {
      if (!isRecord(stream) || !isTrackType(stream.type) || typeof stream.codec !== 'string' || !isSha256(stream.sha256)) {
        return undefined;
      }
      streams.push({ type: stream.type, codec: stream.codec, sha256: stream.sha256.toLowerCase() });
    }
    if (streams.length === 0) return undefined;
    wrappers.push({ assetId: wrapper.assetId, container: wrapper.container, streams });
  }
  return {
    schema: PROBE_WRAPPER_EQUIVALENCE_SCHEMA,
    groupId: value.groupId,
    wrappers,
    generatedBy: value.generatedBy,
  };
}

/** Prove that every wrapper names the same ordered elementary-stream payload identities. */
export function assessProbeWrapperEquivalence(
  evidence: ProbeWrapperEquivalenceEvidence,
): ProbeContractAssessment {
  if (evidence.schema !== PROBE_WRAPPER_EQUIVALENCE_SCHEMA || evidence.wrappers.length < 2) {
    return contractError('PROBE_WRAPPER_EVIDENCE_INVALID', 'wrapper evidence needs at least two entries under the current schema');
  }
  const anchor = evidence.wrappers[0]!;
  const anchorKey = streamFingerprintKey(anchor.streams);
  const failures: string[] = [];
  for (const wrapper of evidence.wrappers.slice(1)) {
    if (streamFingerprintKey(wrapper.streams) !== anchorKey) {
      failures.push(`${wrapper.assetId} elementary-stream fingerprints differ from ${anchor.assetId}`);
    }
  }
  const containers = new Set(evidence.wrappers.map((entry) => entry.container.trim().toLowerCase()));
  if (containers.size < 2) failures.push('wrapper evidence does not span at least two container families');
  if (failures.length) {
    return verdict('FAIL', 'PROBE_WRAPPERS_NOT_CONTENT_EQUIVALENT', failures.join('; '), undefined, {
      groupId: evidence.groupId,
      wrappers: evidence.wrappers,
    });
  }
  return verdict(
    'PASS',
    'PROBE_WRAPPERS_CONTENT_EQUIVALENT',
    `${evidence.wrappers.length} wrappers share ${anchor.streams.length} elementary-stream fingerprint(s)`,
    undefined,
    { groupId: evidence.groupId, wrappers: evidence.wrappers },
  );
}

/**
 * Compare every observation to its own golden and compare the measured wrappers directly. The
 * maximum pairwise delta is retained, so input order cannot alter the verdict or diagnostics.
 */
export function assessCrossContainerProbeDuration(
  observations: readonly ProbeDurationObservation[],
): ProbeContractAssessment {
  if (observations.length < 2) {
    return contractError('PROBE_CROSS_WRAPPER_NEEDS_TWO_INPUTS', 'cross-container duration needs at least two observations');
  }
  const failures: string[] = [];
  const perInputGoldenDeltasSec: Record<string, number> = {};
  let maximumCrossWrapperDeltaSec = 0;
  let maximumCrossWrapperToleranceSec = 0;

  for (const observation of observations) {
    if (!Number.isFinite(observation.toleranceSec) || observation.toleranceSec < 0) {
      return contractError('PROBE_DURATION_TOLERANCE_INVALID', `${observation.assetId} has an invalid duration tolerance`);
    }
    if (observation.durationSec == null || !Number.isFinite(observation.durationSec) || observation.durationSec < 0) {
      failures.push(`${observation.assetId} measured duration is not a finite non-negative value`);
      continue;
    }
    if (observation.goldenDurationSec == null || !Number.isFinite(observation.goldenDurationSec) || observation.goldenDurationSec < 0) {
      return contractError(
        'PROBE_WRAPPER_GOLDEN_DURATION_INVALID',
        `${observation.assetId} lacks a finite non-negative golden duration`,
      );
    }
    const delta = Math.abs(observation.durationSec - observation.goldenDurationSec);
    perInputGoldenDeltasSec[observation.assetId] = delta;
    if (delta > observation.toleranceSec) {
      failures.push(
        `${observation.assetId} measured ${observation.durationSec}s vs golden ${observation.goldenDurationSec}s ` +
          `(Δ ${delta}s > ${observation.toleranceSec}s)`,
      );
    }
  }

  for (let left = 0; left < observations.length; left++) {
    for (let right = left + 1; right < observations.length; right++) {
      const a = observations[left]!;
      const b = observations[right]!;
      if (a.durationSec == null || b.durationSec == null || !Number.isFinite(a.durationSec) || !Number.isFinite(b.durationSec)) {
        continue;
      }
      const delta = Math.abs(a.durationSec - b.durationSec);
      const tolerance = Math.max(a.toleranceSec, b.toleranceSec);
      maximumCrossWrapperDeltaSec = Math.max(maximumCrossWrapperDeltaSec, delta);
      maximumCrossWrapperToleranceSec = Math.max(maximumCrossWrapperToleranceSec, tolerance);
      if (delta > tolerance) {
        failures.push(
          `${a.assetId} vs ${b.assetId} direct measured duration Δ ${delta}s > ${tolerance}s`,
        );
      }
    }
  }

  const measurements: Record<string, number> = {
    wrapperCount: observations.length,
    maximumCrossWrapperDeltaSec,
    maximumCrossWrapperToleranceSec,
  };
  for (const [assetId, delta] of Object.entries(perInputGoldenDeltasSec)) {
    measurements[`goldenDeltaSec:${assetId}`] = delta;
  }
  const evidence = {
    perInputGoldenDeltasSec,
    maximumCrossWrapperDeltaSec,
    maximumCrossWrapperToleranceSec,
    observations: observations.map((entry) => ({ ...entry })),
  };
  if (failures.length) {
    return verdict('FAIL', 'PROBE_CROSS_WRAPPER_DURATION_MISMATCH', failures.join('; '), measurements, evidence);
  }
  return verdict(
    'PASS',
    'PROBE_CROSS_WRAPPER_DURATION_MATCH',
    `${observations.length} content-equivalent wrappers match their goldens and each other`,
    measurements,
    evidence,
  );
}

export function assessHeaderlessProbeDuration(
  durationSec: number | null,
  contract: ProbeHeaderlessDurationContract = RECORDER_HEADERLESS_DURATION_CONTRACT,
): ProbeContractAssessment {
  if (
    contract.schema !== PROBE_HEADERLESS_DURATION_SCHEMA ||
    contract.allowUnknown !== true ||
    !Number.isFinite(contract.contentSpanSec) ||
    contract.contentSpanSec < 0 ||
    !Number.isFinite(contract.tailAndRoundingAllowanceSec) ||
    contract.tailAndRoundingAllowanceSec < 0
  ) {
    return contractError('PROBE_HEADERLESS_DURATION_CONTRACT_INVALID', 'headerless duration contract is malformed');
  }
  const maxDurationSec = contract.contentSpanSec + contract.tailAndRoundingAllowanceSec;
  const measurements = {
    contentSpanSec: contract.contentSpanSec,
    maxDurationSec,
    ...(typeof durationSec === 'number' && Number.isFinite(durationSec) ? { measuredDurationSec: durationSec } : {}),
  };
  if (durationSec === null) {
    return verdict(
      'PASS',
      'PROBE_HEADERLESS_DURATION_UNKNOWN_ALLOWED',
      'duration is explicitly unknown, which this headerless contract permits',
      measurements,
    );
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return verdict(
      'FAIL',
      'PROBE_HEADERLESS_DURATION_INVALID',
      `duration must be null or finite and non-negative; measured ${String(durationSec)}`,
      measurements,
    );
  }
  if (durationSec > maxDurationSec) {
    return verdict(
      'FAIL',
      'PROBE_HEADERLESS_DURATION_OUT_OF_BOUND',
      `measured ${durationSec}s exceeds content-derived maximum ${maxDurationSec}s`,
      measurements,
    );
  }
  return verdict(
    'DIFF',
    'PROBE_HEADERLESS_DURATION_FINITE_ESTIMATE',
    `finite ${durationSec}s estimate is sane but differs from the header's explicit unknown representation`,
    measurements,
  );
}

export function headerlessDurationContractFromOptions(options: unknown): ProbeHeaderlessDurationContract | undefined {
  if (!isRecord(options)) return undefined;
  const direct = options.probeContract;
  const robustness = isRecord(options.robustness) ? options.robustness : undefined;
  const probe = isRecord(robustness?.probe) ? robustness.probe : undefined;
  const candidate = direct ?? probe?.probeContract;
  if (!isRecord(candidate) || candidate.schema !== PROBE_HEADERLESS_DURATION_SCHEMA) return undefined;
  if (
    candidate.allowUnknown !== true ||
    typeof candidate.contentSpanSec !== 'number' ||
    typeof candidate.tailAndRoundingAllowanceSec !== 'number'
  ) {
    return undefined;
  }
  return {
    schema: PROBE_HEADERLESS_DURATION_SCHEMA,
    allowUnknown: true,
    contentSpanSec: candidate.contentSpanSec,
    tailAndRoundingAllowanceSec: candidate.tailAndRoundingAllowanceSec,
  };
}

function streamFingerprintKey(streams: readonly ProbeWrapperStreamFingerprint[]): string {
  return streams
    .map((stream) => `${stream.type}:${stream.codec.trim().toLowerCase()}:${stream.sha256.toLowerCase()}`)
    .sort()
    .join('|');
}

function isTrackType(value: unknown): value is ProbeWrapperStreamFingerprint['type'] {
  return value === 'video' || value === 'audio' || value === 'subtitle' || value === 'other';
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
