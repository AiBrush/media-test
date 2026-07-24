/**
 * Reviewed matrix suppressions.
 *
 * Applicability does not belong in this table. A concrete engine inability is expressed through the
 * shared tuple-support protocol and becomes NA_ENGINE. A browser configuration miss becomes
 * NA_BROWSER, and an applicable defect runs to FAIL/ERROR. The only entries allowed here are narrow
 * safety or run-budget policy decisions with enough evidence to be audited and retired.
 */

export type DisabledPolicyMode = 'enforce' | 'audit';

export interface ReviewedSuppressionMetadata {
  /** Team/person accountable for reviewing and retiring the suppression. */
  owner: string;
  /** Stable issue or backlog reference. */
  issue: string;
  /** Reproduction or measured run evidence, not an unsupported-tuple claim. */
  evidence: string;
  /** ISO instant after which CI rejects the entry until it is reviewed again. */
  expiresAtIso: string;
  /** Concrete condition that triggers an earlier retest/removal. */
  retestCondition: string;
  /** Why ordinary Worker isolation cannot currently make this cell safe/affordable. */
  workerIsolationReason: string;
  /** Empty means every browser; otherwise policy applies only to the named browser families. */
  browsers: readonly string[];
}

export interface DisabledCell extends ReviewedSuppressionMetadata {
  kind: 'budget' | 'safety';
  engineId: string;
  scenarioId: string;
  reason: string;
}

/**
 * A known synchronous reproduction that cannot yet be entered safely. It remains an applicable
 * timeout FAIL (never SKIPPED or NA) until the real corrupted-file Worker reproduction is proven.
 */
export interface ForcedTimeoutCell extends ReviewedSuppressionMetadata {
  kind: 'forced-timeout';
  engineId: string;
  scenarioId: string;
  timeoutMs: number;
  reason: string;
}

const OWNER = 'media-test runner maintainers';
const REVIEW_EXPIRY = '2027-01-31T00:00:00.000Z';

function budget(
  scenarioId: string,
  evidence: string,
  retestCondition: string,
): DisabledCell {
  return {
    kind: 'budget',
    engineId: 'remotion@4.0.479',
    scenarioId,
    owner: OWNER,
    issue: 'REQ-RUN-07/remotion-long-form-budget',
    evidence,
    expiresAtIso: REVIEW_EXPIRY,
    retestCondition,
    workerIsolationReason:
      'Worker termination bounds UI blocking but does not make repeated full-file parsing/encoding fit the shared matrix CPU and memory budget.',
    browsers: [],
    reason: `reviewed budget suppression: ${evidence}`,
  };
}

// Real per-file Worker isolation makes static timeout fabrication unnecessary. Kept as an empty
// compatibility surface so older audit consumers can prove that every former entry was retired.
const FORCED_TIMEOUT_CELLS: readonly ForcedTimeoutCell[] = [];

/**
 * This is intentionally much smaller than the former table: tuple limitations and applicable
 * defects were removed. What remains is long-form work with measured, multiplicative suite cost or
 * one narrow main-thread safety quarantine.
 */
const DISABLED_CELLS: readonly DisabledCell[] = [
  budget(
    'performance/size-ladder-iterate-packets-huge',
    'Repeated full packet iteration of the huge file exceeded the 300-second benchmark watchdog.',
    'Retest when benchmark work can reuse a validated packet walk or parser throughput materially improves.',
  ),
  budget(
    'performance/size-ladder-demux-peak-memory-huge',
    'A measured browser run took more than four minutes before peak-memory aggregation.',
    'Retest after a streaming parser path no longer retains the complete packet walk.',
  ),
  budget(
    'streaming-output/buffer_massive_h264_mp4',
    'A no-reuse Chromium run timed out buffering the two-hour MP4 through bufferWriter.',
    'Retest when the adapter exposes a bounded streaming target for this operation.',
  ),
  budget(
    'performance/size-ladder-iterate-packets-large',
    'Repeated packet iteration of the 120-second rung exceeds the shared performance-run allocation.',
    'Retest after parser throughput or benchmark reuse materially improves.',
  ),
  budget(
    'performance/size-ladder-iterate-packets-massive',
    'Repeated packet iteration of the two-hour rung exceeds the shared performance-run allocation.',
    'Retest after parser throughput or benchmark reuse materially improves.',
  ),
  budget(
    'performance/size-ladder-demux-peak-memory-large',
    'Repeated full demux of the 120-second rung exceeds the shared measurement allocation.',
    'Retest after memory measurement can observe one validated packet walk.',
  ),
  budget(
    'audio-dsp/edge_longform_audio_resample_16k',
    'Resampling the complete one-hour PCM fixture through conversion exceeds the shared run budget.',
    'Retest after chunked audio conversion avoids whole-file buffering/repetition.',
  ),
];

export interface DisabledCellAuditInput {
  engineIds: readonly string[];
  scenarioIds: readonly string[];
  now?: Date;
}

export interface DisabledCellAuditIssue {
  code:
    | 'DUPLICATE_RULE'
    | 'EXPIRED_RULE'
    | 'ORPHAN_ENGINE'
    | 'ORPHAN_SCENARIO'
    | 'INVALID_METADATA';
  engineId: string;
  scenarioId: string;
  detail: string;
}

export function reviewedDisabledCells(): readonly DisabledCell[] {
  return DISABLED_CELLS;
}

export function reviewedForcedTimeoutCells(): readonly ForcedTimeoutCell[] {
  return FORCED_TIMEOUT_CELLS;
}

/** CI-facing structural/orphan/expiry audit. An empty array is the only passing result. */
export function auditDisabledCells(input: DisabledCellAuditInput): DisabledCellAuditIssue[] {
  const now = input.now ?? new Date();
  const issues: DisabledCellAuditIssue[] = [];
  const seen = new Set<string>();
  for (const cell of [...DISABLED_CELLS, ...FORCED_TIMEOUT_CELLS]) {
    const key = `${cell.engineId}\u0000${cell.scenarioId}`;
    if (seen.has(key)) {
      issues.push(issue('DUPLICATE_RULE', cell, 'more than one reviewed rule targets this cell'));
    }
    seen.add(key);
    const expiry = Date.parse(cell.expiresAtIso);
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) {
      issues.push(issue('EXPIRED_RULE', cell, `expiry '${cell.expiresAtIso}' is invalid or elapsed`));
    }
    if (!input.engineIds.some((id) => engineIdsMatch(id, cell.engineId))) {
      issues.push(issue('ORPHAN_ENGINE', cell, `engine '${cell.engineId}' is not registered`));
    }
    if (!input.scenarioIds.includes(cell.scenarioId)) {
      issues.push(issue('ORPHAN_SCENARIO', cell, `scenario '${cell.scenarioId}' is not registered`));
    }
    for (const [field, value] of [
      ['owner', cell.owner],
      ['issue', cell.issue],
      ['evidence', cell.evidence],
      ['retestCondition', cell.retestCondition],
      ['workerIsolationReason', cell.workerIsolationReason],
      ['reason', cell.reason],
    ] as const) {
      if (!value.trim()) issues.push(issue('INVALID_METADATA', cell, `${field} must be non-empty`));
    }
  }
  return issues.sort(
    (a, b) =>
      a.engineId.localeCompare(b.engineId) ||
      a.scenarioId.localeCompare(b.scenarioId) ||
      a.code.localeCompare(b.code),
  );
}

function issue(
  code: DisabledCellAuditIssue['code'],
  cell: Pick<DisabledCell, 'engineId' | 'scenarioId'>,
  detail: string,
): DisabledCellAuditIssue {
  return { code, engineId: cell.engineId, scenarioId: cell.scenarioId, detail };
}

function engineIdsMatch(registered: string, reviewed: string): boolean {
  return (
    registered === reviewed ||
    reviewed.startsWith(`${registered}@`) ||
    registered.startsWith(`${reviewed}@`)
  );
}

export function disabledCellReason(
  engineId: string,
  scenarioId: string,
  mode: DisabledPolicyMode = 'enforce',
  browser?: string,
): string | undefined {
  if (mode === 'audit') return undefined;
  const cell = DISABLED_CELLS.find(
    (candidate) =>
      candidate.engineId === engineId &&
      candidate.scenarioId === scenarioId &&
      (candidate.browsers.length === 0 || (browser !== undefined && candidate.browsers.includes(browser))),
  );
  if (!cell) return undefined;
  return `[${cell.issue}] ${cell.reason}; owner=${cell.owner}; expires=${cell.expiresAtIso}; retest=${cell.retestCondition}`;
}

export function forcedTimeoutCell(
  engineId: string,
  scenarioId: string,
  browser?: string,
): ForcedTimeoutCell | undefined {
  return FORCED_TIMEOUT_CELLS.find(
    (cell) =>
      cell.engineId === engineId &&
      cell.scenarioId === scenarioId &&
      (cell.browsers.length === 0 || (browser !== undefined && cell.browsers.includes(browser))),
  );
}
