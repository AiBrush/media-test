export const DEMUX_REQUIRED_COVERAGE = Object.freeze([
  Object.freeze({ axis: 'fragmented-cmaf-input', scenarioId: 'demux/fragmented_cmaf', assetId: 'fragmented_cmaf.mp4' }),
  Object.freeze({ axis: 'mislabeled-container', scenarioId: 'demux/mislabeled_h264', assetId: 'mislabeled_h264.webm' }),
  Object.freeze({ axis: 'gapless-priming-padding', scenarioId: 'demux/gapless_aac', assetId: 'gapless_aac.m4a' }),
  Object.freeze({ axis: 'ts-discontinuity', scenarioId: 'demux/ts_discontinuity', assetId: 'ts_discontinuity.ts' }),
  Object.freeze({ axis: 'caf-pcm', scenarioId: 'demux/pcm_s16_caf', assetId: 'pcm_s16.caf' }),
  Object.freeze({ axis: 'aac-raw-vs-adts', scenarioId: 'demux/aac_audio_only', assetId: 'aac_audio_only.m4a' }),
] as const);

export type DemuxCoverageAxis = (typeof DEMUX_REQUIRED_COVERAGE)[number]['axis'];

export interface DemuxCorpusAssetRecord {
  readonly id: string;
  readonly sha256?: string;
  readonly sizeBytes?: number;
}

export interface DemuxCoverageScenarioRecord {
  readonly id: string;
  readonly input: string | readonly string[];
  readonly oracles: readonly string[];
}

export interface DemuxCoverageAudit {
  readonly ok: boolean;
  readonly missingScenarioIds: readonly string[];
  readonly missingAssetIds: readonly string[];
  readonly missingGoldenEvidence: readonly string[];
  readonly provenanceFailures: readonly string[];
}

/** Pure acceptance audit: each added axis needs a runnable row, digest-bound asset, and meta+packet evidence. */
export function auditDemuxCoverage(
  scenarios: readonly DemuxCoverageScenarioRecord[],
  assets: readonly DemuxCorpusAssetRecord[],
  goldenExists: (assetId: string, kind: 'meta' | 'packets') => boolean,
): DemuxCoverageAudit {
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const missingScenarioIds: string[] = [];
  const missingAssetIds: string[] = [];
  const missingGoldenEvidence: string[] = [];
  const provenanceFailures: string[] = [];
  for (const requirement of DEMUX_REQUIRED_COVERAGE) {
    const scenario = scenarioById.get(requirement.scenarioId);
    if (!scenario) {
      missingScenarioIds.push(requirement.scenarioId);
      continue;
    }
    const declaredInputs = Array.isArray(scenario.input) ? scenario.input : [scenario.input];
    if (!declaredInputs.includes(requirement.assetId)) missingAssetIds.push(`${requirement.scenarioId}:${requirement.assetId}`);
    if (!scenario.oracles.includes('golden-packets') || !scenario.oracles.includes('golden-metadata')) {
      missingGoldenEvidence.push(`${requirement.scenarioId}:oracle-declaration`);
    }
    const asset = assetById.get(requirement.assetId);
    if (!asset) {
      missingAssetIds.push(requirement.assetId);
    } else if (!/^[a-f0-9]{64}$/i.test(asset.sha256 ?? '') || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes! <= 0) {
      provenanceFailures.push(requirement.assetId);
    }
    for (const kind of ['meta', 'packets'] as const) {
      if (!goldenExists(requirement.assetId, kind)) missingGoldenEvidence.push(`${requirement.assetId}:${kind}`);
    }
  }
  return Object.freeze({
    ok: missingScenarioIds.length + missingAssetIds.length + missingGoldenEvidence.length + provenanceFailures.length === 0,
    missingScenarioIds: Object.freeze(missingScenarioIds),
    missingAssetIds: Object.freeze(missingAssetIds),
    missingGoldenEvidence: Object.freeze(missingGoldenEvidence),
    provenanceFailures: Object.freeze(provenanceFailures),
  });
}
