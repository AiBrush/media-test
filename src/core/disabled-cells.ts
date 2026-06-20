/**
 * Exact engine/scenario cells intentionally disabled by suite policy.
 *
 * Keep this outside scenario definitions so scenarios stay engine-independent: a disabled cell is a
 * runner decision about one engine's practicality for one case, not a change to the case itself.
 */

export interface DisabledCell {
  engineId: string;
  scenarioId: string;
  reason: string;
}

const DISABLED_CELLS: DisabledCell[] = [
  {
    engineId: 'remotion-media-parser@4.0.479',
    scenarioId: 'demux/size_huge_huge_h264_1080p_600s',
    reason: 'disabled: it takes so much time',
  },
];

export function disabledCellReason(engineId: string, scenarioId: string): string | undefined {
  return DISABLED_CELLS.find((cell) => cell.engineId === engineId && cell.scenarioId === scenarioId)?.reason;
}
