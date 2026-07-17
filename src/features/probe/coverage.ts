import { contractError, verdict, type ProbeContractAssessment } from './types.ts';

export const PROBE_COVERAGE_DECISIONS_SCHEMA = 'media-test/probe-coverage-decisions@1' as const;
export const PROBE_COVERAGE_DECISIONS_REVISION = 1 as const;

export type ProbeCoverageDecision =
  | {
      axis: string;
      status: 'SCENARIO';
      scenarioId: string;
      assetId: string;
      goldenId: string;
    }
  | {
      axis: string;
      status: 'OUT_OF_SCOPE';
      reasonCode: string;
      rationale: string;
      revisit: string;
    };

export interface ProbeCoverageDecisionCatalog {
  schema: typeof PROBE_COVERAGE_DECISIONS_SCHEMA;
  revision: typeof PROBE_COVERAGE_DECISIONS_REVISION;
  decisions: readonly ProbeCoverageDecision[];
}

/**
 * Every item from the former source-code gap comment has one executable row or a versioned decision.
 * OUT_OF_SCOPE means "not in this catalog revision", never a permanently registered missing asset.
 */
export const PROBE_COVERAGE_DECISIONS: ProbeCoverageDecisionCatalog = Object.freeze({
  schema: PROBE_COVERAGE_DECISIONS_SCHEMA,
  revision: PROBE_COVERAGE_DECISIONS_REVISION,
  decisions: Object.freeze([
    scenario('fragmented-mp4-cmaf', 'probe/fragmented_cmaf', 'fragmented_cmaf.mp4'),
    outOfScope(
      'avi',
      'PROBE_COVERAGE_FIXTURE_NOT_CURATED',
      'No deterministic AVI fixture and committed normalized golden is curated in revision 1.',
      'Revisit when a contesting adapter tuple and deterministic fixture recipe land together.',
    ),
    outOfScope(
      'flv',
      'PROBE_COVERAGE_FIXTURE_NOT_CURATED',
      'No deterministic FLV fixture and committed normalized golden is curated in revision 1.',
      'Revisit when a contesting adapter tuple and deterministic fixture recipe land together.',
    ),
    outOfScope(
      '3gp',
      'PROBE_COVERAGE_FIXTURE_NOT_CURATED',
      '3GP is not emitted until its brand/codec profile and at least one contesting adapter are pinned.',
      'Revisit with a deterministic 3GP recipe plus a semantic brand golden.',
    ),
    outOfScope(
      '3g2',
      'PROBE_COVERAGE_FIXTURE_NOT_CURATED',
      '3G2 is not conflated with 3GP and has no separately curated fixture in revision 1.',
      'Revisit with a deterministic 3G2 recipe and a contesting adapter tuple.',
    ),
    scenario('caf', 'probe/pcm_s16_caf', 'pcm_s16.caf'),
    outOfScope(
      'ogv',
      'PROBE_COVERAGE_FIXTURE_NOT_CURATED',
      'Ogg video has no deterministic fixture/golden pair in revision 1.',
      'Revisit when an OGV codec profile supported by at least one adapter is pinned.',
    ),
    outOfScope(
      'gif-as-video',
      'PROBE_COVERAGE_SEMANTICS_UNRESOLVED',
      'Animated GIF needs an explicit image-vs-video normalized-track policy before it can be scored fairly.',
      'Revisit after the normalized metadata contract defines animated-image track semantics.',
    ),
    scenario('degenerate-1x1', 'probe/video_1x1', 'video_1x1.webm'),
    outOfScope(
      'degenerate-0x0',
      'PROBE_COVERAGE_INVALID_POSITIVE_FIXTURE',
      'A zero-by-zero coded video is not a valid positive media fixture; malformed dimension signaling belongs in robustness.',
      'Revisit only as a typed malformed-input rejection row, never as a golden metadata success row.',
    ),
    scenario('extreme-1fps', 'probe/h264_1fps_30s', 'h264_1fps_30s.mp4'),
    scenario('extreme-240fps', 'probe/video_240fps', 'video_240fps.mp4'),
    scenario('mislabeled-content', 'probe/mislabeled_h264_content', 'mislabeled_h264.webm'),
    scenario('audio-5.1', 'probe/wav_5_1', 'wav_5_1.wav'),
    scenario('ts-discontinuity', 'probe/ts_discontinuity', 'ts_discontinuity.ts'),
  ]),
});

export interface ProbeCoverageAuditEnvironment {
  scenarioExists(scenarioId: string): boolean;
  assetExists(assetId: string): boolean;
  goldenExists(goldenId: string): boolean;
}

export function auditProbeCoverageDecisions(
  catalog: ProbeCoverageDecisionCatalog,
  environment: ProbeCoverageAuditEnvironment,
): ProbeContractAssessment {
  if (catalog.schema !== PROBE_COVERAGE_DECISIONS_SCHEMA || catalog.revision !== PROBE_COVERAGE_DECISIONS_REVISION) {
    return contractError('PROBE_COVERAGE_CATALOG_SCHEMA_INVALID', 'probe coverage decision catalog schema/revision is invalid');
  }
  const failures: string[] = [];
  const seen = new Set<string>();
  let scenarios = 0;
  let outOfScopeCount = 0;
  for (const decision of catalog.decisions) {
    if (!decision.axis || seen.has(decision.axis)) {
      failures.push(`coverage axis '${decision.axis}' is empty or duplicated`);
      continue;
    }
    seen.add(decision.axis);
    if (decision.status === 'SCENARIO') {
      scenarios++;
      if (!environment.scenarioExists(decision.scenarioId)) failures.push(`${decision.axis}: scenario ${decision.scenarioId} is absent`);
      if (!environment.assetExists(decision.assetId)) failures.push(`${decision.axis}: asset ${decision.assetId} is absent`);
      if (!environment.goldenExists(decision.goldenId)) failures.push(`${decision.axis}: golden ${decision.goldenId} is absent`);
    } else {
      outOfScopeCount++;
      if (!decision.reasonCode || !decision.rationale || !decision.revisit) {
        failures.push(`${decision.axis}: OUT_OF_SCOPE decision is not reasoned and revisitable`);
      }
    }
  }
  const measurements = { axes: catalog.decisions.length, scenarios, outOfScope: outOfScopeCount };
  if (failures.length) {
    return verdict('FAIL', 'PROBE_COVERAGE_DECISION_AUDIT_FAILED', failures.join('; '), measurements, {
      schema: catalog.schema,
      revision: catalog.revision,
    });
  }
  return verdict(
    'PASS',
    'PROBE_COVERAGE_DECISIONS_COMPLETE',
    `${scenarios} executable axes and ${outOfScopeCount} versioned decisions account for every declared gap`,
    measurements,
    { schema: catalog.schema, revision: catalog.revision },
  );
}

function scenario(axis: string, scenarioId: string, assetId: string): ProbeCoverageDecision {
  return { axis, status: 'SCENARIO', scenarioId, assetId, goldenId: `${assetId}.meta.json` };
}

function outOfScope(
  axis: string,
  reasonCode: string,
  rationale: string,
  revisit: string,
): ProbeCoverageDecision {
  return { axis, status: 'OUT_OF_SCOPE', reasonCode, rationale, revisit };
}
