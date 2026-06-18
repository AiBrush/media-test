/**
 * src/core/format.ts — the SINGLE source of truth for the human-facing per-cell result string.
 *
 * USER DIRECTIVE: every visible matrix/report cell must read as exactly one of:
 *   - `Pass (<execution time>)`   — the operation ran and every declared oracle passed
 *   - `N/A`                       — the framework or the browser genuinely cannot run the case
 *
 * This module is the ONE place that collapses the richer internal `ScenarioResult.status`
 * (`PASS | FAIL | NA_ENGINE | NA_BROWSER | NA_ASSET | ERROR | SKIPPED`) down to that display vocabulary. It is
 * deliberately pure (no DOM, no Node API) so BOTH the in-page live matrix (`src/app/ui.ts`) and the
 * markdown report (`src/core/report.ts`, which also runs under bun/in a Worker) share identical logic.
 *
 * IMPORTANT — we collapse, we do NOT mask. The internal status is preserved verbatim everywhere
 * (`ScenarioResult.status`, `report.json`): this function only chooses what a HUMAN sees. The NA
 * flavors fold into one `N/A` (the reader does not need the table to distinguish engine, browser, or
 * asset gaps), but FAIL / ERROR / SKIPPED are NEVER silently relabelled as `Pass` or `N/A` — a wrong/broken
 * cell stays visibly wrong so it is fixed, not hidden (anti-pattern: do not classify a bug as N/A).
 * Once every targeted cell is genuinely PASS or NA, the surface naturally contains only Pass/N/A.
 */

import type { ResultStatus } from './scenario.ts';

/** The single collapsed "not applicable" marker shown for all NA_* statuses. */
export const NA_DISPLAY = 'N/A';

/** Placeholder for a cell that was never run (no result for the triple). */
export const NOT_RUN_DISPLAY = '—';

/** The minimal slice of a ScenarioResult this module needs to compute the display string. */
export interface DisplayResult {
  status: ResultStatus;
  /** aggregated bench stats; we read `bench.wall.median` (ms) as the preferred execution time. */
  bench?: { wall?: { median?: number } } | undefined;
  /** wall-clock fallback (ms) for functional-only PASS cells that carry no bench. */
  durationMs?: number | undefined;
}

/**
 * Format a millisecond duration the way the directive's examples read:
 *   `12.4 ms` · `348 ms` · `1.21 s`.
 * Sub-second values are shown in ms (2 sig-figs under 100, integer at/above 100); ≥1000 ms switches
 * to seconds with the same rounding rule. Non-finite/negative input yields the em-dash placeholder.
 */
export function formatExecTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return NOT_RUN_DISPLAY;
  if (ms >= 1000) return `${trimNum(ms / 1000)} s`;
  return `${trimNum(ms)} ms`;
}

/** Round for display: integer at/above 100, else 2 decimal places, with trailing-zero noise removed. */
function trimNum(n: number): string {
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  return String(rounded);
}

/**
 * The execution-time source for a PASS cell, in the directive's priority order (§"Pick The Execution
 * Time Source"): the measured wall median first, then the runner's `durationMs` fallback for
 * functional-only PASS cells with no bench. `engine.init()` is excluded from `bench.wall` by the
 * runner; `durationMs` is the whole-cell wall fallback used only when nothing was benched.
 */
export function pickExecutionMs(r: DisplayResult): number | undefined {
  const wall = r.bench?.wall?.median;
  if (typeof wall === 'number' && Number.isFinite(wall)) return wall;
  if (typeof r.durationMs === 'number' && Number.isFinite(r.durationMs)) return r.durationMs;
  return undefined;
}

/**
 * THE human-facing per-cell string. PASS with a time → `Pass (<time>)`; NA_* →
 * `N/A`. A PASS missing any timing source, plus FAIL, ERROR and SKIPPED, are returned as raw internal
 * markers so an unfixed cell stays visibly broken rather than being masked as a pass or an N/A.
 * Callers that have driven their targeted matrix to all-PASS-or-NA with timing will therefore only
 * ever see `Pass (…)` / `N/A`.
 */
export function visibleResult(r: DisplayResult): string {
  switch (r.status) {
    case 'PASS': {
      const ms = pickExecutionMs(r);
      return ms === undefined ? 'PASS' : `Pass (${formatExecTime(ms)})`;
    }
    case 'NA_ENGINE':
    case 'NA_BROWSER':
    case 'NA_ASSET':
      return NA_DISPLAY;
    case 'FAIL':
    case 'ERROR':
    case 'SKIPPED':
      return r.status; // honest: a broken/skipped cell is never relabelled Pass/N-A
    default:
      return NOT_RUN_DISPLAY;
  }
}

/** True when the status collapses to the single user-facing `N/A` marker. */
export function isNaStatus(status: ResultStatus | null | undefined): boolean {
  return status === 'NA_ENGINE' || status === 'NA_BROWSER' || status === 'NA_ASSET';
}
