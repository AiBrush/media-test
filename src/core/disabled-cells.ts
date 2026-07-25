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

// Real per-file Worker isolation makes static timeout fabrication unnecessary. Kept as an empty
// compatibility surface so older audit consumers can prove that every former entry was retired.
const FORCED_TIMEOUT_CELLS: readonly ForcedTimeoutCell[] = [];

/**
 * This is intentionally much smaller than the former table: tuple limitations and applicable
 * defects were removed. What remains is long-form work with measured, multiplicative suite cost or
 * one narrow main-thread safety quarantine.
 */
// Every former performance budget entry is now an adapter-owned, pre-content NA_ENGINE decision.
// Keeping this list empty proves reviewed suppressions cannot hide applicability.
const DISABLED_CELLS: readonly DisabledCell[] = [];

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
