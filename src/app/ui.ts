/** Accessible, bounded-DOM rendering for the browser application. */

import type { EnvInfo, CodecSupport } from '../core/feature-detect.ts';
import { formatExecTime, pickExecutionMs } from '../core/format.ts';
import type { Operation } from '../core/engine.ts';
import type { ResultStatus, ScenarioResult } from '../core/scenario.ts';
import { runReportingPipeline } from '../core/reporting/pipeline.ts';
import type { MetricId } from '../core/scenario.ts';
import type { CacheManifestSnapshot, RunCompletionState, RunManifest } from './run-artifact.ts';

export interface MatrixCellRef {
  engineId: string;
  scenarioId: string;
}

export interface PickerItem {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
  checked?: boolean;
}

export interface FeaturePickerItem {
  id: string;
  label: string;
  count: number;
  title?: string;
  checked?: boolean;
}

export const MAX_MATRIX_ROWS = 100;
export const MATRIX_PAGE_SIZE = 75;

export interface MatrixPageBounds {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  visibleCount: number;
}

/**
 * Run-scoped browser evidence.  The array is replaced, never mutated, so a terminal exception can
 * only add an error annotation; it cannot erase rows that were already streamed to the page.
 */
export interface BrowserRunEvidence {
  readonly results: readonly ScenarioResult[];
  readonly terminalError?: string;
}

export function beginBrowserRunEvidence(): BrowserRunEvidence {
  return freezeBrowserRunEvidence([]);
}

export function appendBrowserRunEvidence(
  evidence: BrowserRunEvidence,
  result: ScenarioResult,
): BrowserRunEvidence {
  return freezeBrowserRunEvidence([...evidence.results, result], evidence.terminalError);
}

/**
 * Adopt rows returned by the runner without replacing streamed evidence.  Normal runner output is
 * the same ordered list as the callbacks; the identity merge is the defensive top-level-failure
 * boundary for a runner that returns additional terminal rows.
 */
export function reconcileBrowserRunEvidence(
  evidence: BrowserRunEvidence,
  returned: readonly ScenarioResult[],
): BrowserRunEvidence {
  const merged = [...evidence.results];
  const identities = new Set(merged.map(runResultIdentity));
  for (const result of returned) {
    const identity = runResultIdentity(result);
    if (identities.has(identity)) continue;
    identities.add(identity);
    merged.push(result);
  }
  return freezeBrowserRunEvidence(merged, evidence.terminalError);
}

export function failBrowserRunEvidence(
  evidence: BrowserRunEvidence,
  terminalError: string,
): BrowserRunEvidence {
  return freezeBrowserRunEvidence(evidence.results, terminalError);
}

function freezeBrowserRunEvidence(
  results: readonly ScenarioResult[],
  terminalError?: string,
): BrowserRunEvidence {
  const value = {
    results: Object.freeze([...results]),
    ...(terminalError ? { terminalError } : {}),
  };
  return Object.freeze(value);
}

function runResultIdentity(result: ScenarioResult): string {
  return `${result.browser}\u0000${result.engineId}\u0000${result.scenarioId}`;
}

export type CancellationBoundary = 'terminable-worker' | 'safe-boundary-only';

export interface ActiveRunWork {
  readonly lastCompletedCell?: string;
  readonly currentCell?: string;
  readonly currentFile?: {
    readonly label: string;
    readonly completed: number;
    readonly total: number;
  };
  readonly cancellationBoundary: CancellationBoundary;
}

export interface CancellationPresentation {
  readonly state: 'cancelling' | 'waiting-safe-boundary';
  readonly buttonLabel: string;
  readonly status: string;
  readonly currentWork: string;
}

/** Pure text/state contract shared by live callbacks and stop handling. */
export function activeRunWorkText(work: ActiveRunWork): string {
  const parts: string[] = [];
  if (work.lastCompletedCell) parts.push(`Last completed cell: ${work.lastCompletedCell}.`);
  if (work.currentFile) {
    parts.push(
      `Current exhaustive input: ${work.currentFile.label}. ` +
      `${work.currentFile.completed} of ${work.currentFile.total} inputs resolved.`,
    );
  } else if (work.currentCell) {
    parts.push(`Current cell: ${work.currentCell}.`);
  } else {
    parts.push('Current cell: none; no further cell is in flight.');
  }
  return parts.join(' ');
}

/**
 * Only a terminable Worker is described as actively cancelling.  Every other adapter call is
 * conservatively presented as non-preemptible until it reaches its cleanup/safe boundary, even
 * though its shared AbortSignal has been delivered to any cooperative inner layer.
 */
export function cancellationPresentation(work: ActiveRunWork): CancellationPresentation {
  const current = activeRunWorkText(work);
  if (!work.currentCell && !work.currentFile) {
    return {
      state: 'waiting-safe-boundary',
      buttonLabel: 'Stopping at safe boundary…',
      status: 'Stop requested; no cell is in flight. Stopping at the next matrix boundary.',
      currentWork: `${current} The partial result snapshot remains exportable.`,
    };
  }
  if (work.cancellationBoundary === 'terminable-worker') {
    return {
      state: 'cancelling',
      buttonLabel: 'Cancelling current work…',
      status: 'Stop requested; the current terminable Worker is cancelling now. Cleanup must finish before the partial snapshot is finalized.',
      currentWork: `${current} Cancellation was delivered to the terminable Worker; completed rows remain exportable.`,
    };
  }
  return {
    state: 'waiting-safe-boundary',
    buttonLabel: 'Stopping at safe boundary…',
    status: 'Stop requested; the current cell is treated as non-preemptible because it declares no proven hard-cancellation boundary. Waiting for cleanup at its safe boundary.',
    currentWork: `${current} Cooperative inner layers received the stop signal; the outer cell remains at a non-preemptible safe boundary.`,
  };
}

export interface ResumeCheckpointEvidence {
  readonly runId: string;
  readonly checkpointRunId: string;
  readonly manifestDigest: string;
  readonly checkpointManifestDigest: string;
  readonly cacheValidated: boolean;
  readonly completedCellSetRestored: boolean;
  readonly selectedInputHashes: readonly string[];
  readonly checkpointInputHashes: readonly string[];
}

export interface RunContinuationAction {
  readonly resumable: boolean;
  readonly label: 'Resume validated run' | 'Start new run';
  readonly reason: string;
}

export type UnresolvedMatrixState = 'not-run' | 'pending';

/** Only a fully completed matrix may claim that every unresolved cell is terminally not run. */
export function unresolvedMatrixState(completionState: RunCompletionState): UnresolvedMatrixState {
  return completionState === 'completed' ? 'not-run' : 'pending';
}

/** Resume wording is a capability claim, so every checkpoint identity must be proven first. */
export function runContinuationAction(
  checkpoint?: ResumeCheckpointEvidence,
): RunContinuationAction {
  if (!checkpoint) {
    return { resumable: false, label: 'Start new run', reason: 'No validated checkpoint is restored.' };
  }
  const hashesAreConcrete = checkpoint.selectedInputHashes.length > 0 &&
    checkpoint.selectedInputHashes.every(isSha256) &&
    checkpoint.checkpointInputHashes.every(isSha256);
  const inputsMatch = hashesAreConcrete &&
    checkpoint.selectedInputHashes.length === checkpoint.checkpointInputHashes.length &&
    checkpoint.selectedInputHashes.every((hash, index) => hash === checkpoint.checkpointInputHashes[index]);
  const resumable = checkpoint.runId.length > 0 &&
    checkpoint.runId === checkpoint.checkpointRunId &&
    checkpoint.manifestDigest.length > 0 &&
    checkpoint.manifestDigest === checkpoint.checkpointManifestDigest &&
    checkpoint.cacheValidated &&
    checkpoint.completedCellSetRestored &&
    inputsMatch;
  return resumable
    ? { resumable: true, label: 'Resume validated run', reason: 'Run, manifest, cache, completed cells, and selected input hashes match.' }
    : { resumable: false, label: 'Start new run', reason: 'The prior run is exportable, but no exact validated checkpoint is restored.' };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/** Pure pagination contract used by the DOM renderer and its large-matrix acceptance test. */
export function matrixPageBounds(
  totalRows: number,
  requestedPage: number,
  requestedPageSize = MATRIX_PAGE_SIZE,
): MatrixPageBounds {
  const total = Math.max(0, Math.trunc(totalRows));
  const pageSize = Math.max(1, Math.min(MAX_MATRIX_ROWS, Math.trunc(requestedPageSize) || MATRIX_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(0, Math.min(Math.trunc(requestedPage) || 0, pageCount - 1));
  const start = page * pageSize;
  const end = Math.min(total, start + pageSize);
  return Object.freeze({ page, pageCount, start, end, visibleCount: end - start });
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id} in index.html`);
  return node as T;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function clear(node: HTMLElement): void {
  node.replaceChildren();
}

function fillChip(id: string, text: string, state: 'ok' | 'off' = 'ok'): void {
  const chip = byId(id);
  if (!chip) return;
  clear(chip);
  chip.append(el('span', { class: 'dot', 'aria-hidden': 'true' }), document.createTextNode(text));
  chip.classList.remove('ok', 'off');
  chip.classList.add(state);
}

export function renderEnv(env: EnvInfo, support: CodecSupport): void {
  const host = $('env');
  clear(host);
  const grid = el('dl', { class: 'env-grid' });
  const row = (name: string, value: string): void => {
    grid.append(el('dt', {}, name), el('dd', {}, value));
  };
  row('Browser', `${env.browser}${env.version ? ` ${env.version}` : ''}`);
  row('GPU', env.gpu ?? 'not available');
  row('WebCodecs', support.webcodecs ? 'available' : 'absent');
  row('WebGPU', support.webgpu ? 'available' : 'absent');
  row('Alpha decode', support.alpha ? 'available' : 'absent');
  row('Memory measurement', support.measureMemory ? 'available' : 'not available');
  row('User agent', env.userAgent || 'not available');
  host.append(grid);
  host.append(
    codecPills('Video decode', support.videoDecode),
    codecPills('Video encode', support.videoEncode),
    codecPills('Audio decode', support.audioDecode),
    codecPills('Audio encode', support.audioEncode),
  );
  fillChip('chip-browser', `${env.browser}${env.version ? ` ${env.version}` : ''}`);
  fillChip('chip-webcodecs', support.webcodecs ? 'WebCodecs ready' : 'WebCodecs absent', support.webcodecs ? 'ok' : 'off');
}

function codecPills(label: string, values: Record<string, boolean>): HTMLElement {
  const wrap = el('div', { class: 'codec-pills', 'aria-label': label });
  wrap.append(el('span', { class: 'muted' }, `${label}:`));
  for (const [token, available] of Object.entries(values)) {
    wrap.append(el('span', { class: `pill ${available ? 'yes' : 'no'}` }, `${token}: ${available ? 'yes' : 'no'}`));
  }
  return wrap;
}

function renderChecklist(containerId: string, name: string, items: readonly PickerItem[]): () => string[] {
  const host = $(containerId);
  clear(host);
  if (items.length === 0) {
    host.append(el('span', { class: 'muted' }, 'none available'));
    return () => [];
  }
  for (const item of items) {
    const input = el('input', {
      type: 'checkbox',
      value: item.id,
      'data-group': name,
      'data-run-config': 'true',
      ...(item.disabled ? { 'data-permanent-disabled': 'true' } : {}),
      ...(item.disabled ? { disabled: '' } : {}),
    });
    input.checked = item.checked !== false && !item.disabled;
    const label = el('label', {
      class: 'opt',
      ...(item.title ? { title: item.title, 'aria-label': `${item.label}. ${item.title}` } : {}),
    }, input, ` ${item.label}`);
    host.append(label);
  }
  return () => [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    .filter((input) => input.checked && !input.disabled)
    .map((input) => input.value);
}

export function renderEnginePicker(items: readonly PickerItem[]): () => string[] {
  fillChip('chip-engines', `${items.filter((item) => !item.disabled).length} scored engines`);
  return renderChecklist('engines-list', 'engine', items);
}

export function renderFeaturePicker(items: readonly FeaturePickerItem[]): () => string[] {
  return renderChecklist('features-list', 'feature', items.map((item) => ({
    id: item.id,
    label: `${item.label} (${item.count})`,
    title: item.title,
    checked: item.checked,
  })));
}

export function renderScenarioPicker(items: readonly PickerItem[]): () => string[] {
  fillChip('chip-scenarios', `${items.length} scenarios`);
  return renderChecklist('scenarios-list', 'scenario', items);
}

export function renderOperationPicker(operations: readonly Operation[]): () => string[] {
  return renderChecklist('operations-list', 'operation', operations.map((operation) => ({
    id: operation,
    label: operation,
    checked: true,
  })));
}

export function setAllChecked(containerId: string, checked: boolean): void {
  const host = $(containerId);
  for (const input of host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
    if (!input.disabled) input.checked = checked;
  }
  host.dispatchEvent(new Event('change', { bubbles: true }));
}

export function setConfigurationControlsDisabled(disabled: boolean): void {
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-run-config="true"]')) {
    control.disabled = disabled || control.dataset.permanentDisabled === 'true';
  }
  for (const id of [
    'select-all-features', 'clear-features', 'select-all-eng', 'clear-engines',
    'select-all-scn', 'clear-scenarios', 'select-all-operations', 'clear-operations',
  ]) {
    const button = byId<HTMLButtonElement>(id);
    if (button) button.disabled = disabled;
  }
  const note = byId('next-run-note');
  if (note) note.textContent = disabled ? 'Configuration is frozen; controls apply after this run.' : '';
}

export function renderIntersectionCount(matching: number, total: number): void {
  const node = byId('scenario-intersection');
  if (node) node.textContent = `${matching} of ${total} scenarios match the selected features and operations.`;
}

export function renderRegistrationBanner(lines: readonly string[]): void {
  const existing = byId('registration-banner');
  existing?.remove();
  if (lines.length === 0) return;
  const banner = el('div', { id: 'registration-banner', class: 'banner' });
  banner.append(el('strong', {}, 'Registration notes: '), document.createTextNode(lines.join(' · ')));
  $('controls-section').append(banner);
}

export function renderRunManifest(manifest: RunManifest | undefined): void {
  const host = byId('run-manifest');
  if (!host) return;
  clear(host);
  if (!manifest) {
    host.append(el('p', { class: 'muted' }, 'Idle — no run manifest yet.'));
    return;
  }
  const dl = el('dl', { class: 'manifest-grid' });
  const row = (name: string, value: string): void => dl.append(el('dt', {}, name), el('dd', {}, value));
  row('Run id', manifest.runId);
  row('Manifest digest', manifest.manifestDigest);
  row('State', manifest.completionState);
  row('Started', manifest.startedAtIso);
  row('Ended', manifest.endedAtIso ?? 'pending');
  row('Suite / build', `${manifest.suiteVersion} / ${manifest.buildRevision}`);
  row('Manifest/report schema', `${manifest.schema} / ${manifest.reportingSchemaVersion}`);
  row('Results/status schema', `${manifest.resultSchema} / ${manifest.statusModelVersion}`);
  row('Browser', `${manifest.browser.family}${manifest.browser.build ? ` ${manifest.browser.build}` : ''} (tag: ${manifest.browser.operatorTag})`);
  row('User agent', manifest.browser.userAgent || 'not available');
  row('GPU', manifest.browser.gpu ?? 'not available');
  row('Capability snapshot', compactJson(manifest.capabilities));
  row('Engines', manifest.engineInstanceIds.join(', '));
  row('Engine configurations', Object.keys(manifest.engineConfigurations).length > 0
    ? compactJson(manifest.engineConfigurations)
    : 'pending or not reported');
  row('Filters', `pillar=${manifest.configuration.pillar}; features=${listOrAll(manifest.configuration.featureIds)}; operations=${listOrAll(manifest.configuration.operations)}; scenarios=${listOrAll(manifest.configuration.scenarioIds)}`);
  row('Timing', `warmup=${manifest.configuration.warmup}; iterations=${manifest.configuration.iters}; timeout=${manifest.configuration.timeoutMs} ms`);
  row('Seed / ordering', `${manifest.configuration.randomSeed}; ${manifest.configuration.randomizeOrder ? 'randomized' : 'scenario-major'}; order ${manifest.executionOrderDigest}`);
  row('Definition digests', `scenarios ${manifest.scenarioDefinitionDigest}; oracles/tolerances ${manifest.oracleDefinitionDigest}`);
  row('Media', `${manifest.configuration.mediaMode}; corpus ${manifest.corpusChecksum ?? 'pending'}`);
  row('Cache', [
    manifest.cache.forcedFresh ? 'forced fresh' : 'reuse allowed',
    `${manifest.cache.hits.length} attributed hit(s)`,
    `${manifest.cache.entryCount} stored / ${manifest.cache.invalidatedCount} invalidated`,
    `origin ${manifest.cache.origin}`,
    `epoch ${manifest.cache.validationEpoch}`,
  ].join('; '));
  row('Registration failures', manifest.registrationFailures.length > 0
    ? manifest.registrationFailures.map((failure) => `${failure.kind} ${failure.id}: ${failure.reason}`).join('; ')
    : 'none');
  row('Coverage', `${manifest.observedCellCount} of ${manifest.expectedCellCount} cells observed`);
  if (manifest.partialReason) row('Partial/failure reason', manifest.partialReason);
  host.append(dl);
  const selected = el('div', { class: 'selected-inputs' });
  selected.append(el('h3', {}, 'Selected catalog inputs'));
  if (manifest.selectedInputs.length === 0) {
    selected.append(el('p', { class: 'muted' }, 'Selection pending or no input was executed.'));
  } else {
    const list = el('ul');
    for (const input of manifest.selectedInputs) {
      list.append(el('li', {}, [
        `${input.scenarioId}: ${input.file}`,
        `SHA-256 ${input.sha256 ?? 'not available'}`,
        `${input.candidateCount ?? 'unknown'} candidate(s)`,
        input.executedInputDigest ? `executed set ${input.executedInputDigest}` : undefined,
        input.eligiblePoolDigest ? `eligible pool ${input.eligiblePoolDigest}` : undefined,
      ].filter(Boolean).join(' · ')));
    }
    selected.append(list);
  }
  host.append(selected);
  if (manifest.cache.hits.length > 0) {
    const hits = el('div', { class: 'cache-hit-provenance' });
    hits.append(el('h3', {}, 'Attributed cache reuse'));
    const list = el('ul');
    for (const hit of manifest.cache.hits) {
      list.append(el('li', {}, [
        `source run ${hit.sourceRunId ?? 'unknown'}`,
        `created ${hit.createdAtIso}`,
        `origin ${hit.originalOrigin}`,
        `epoch ${hit.validationEpoch}`,
        hit.validBecause,
        hit.importedFrom ? `imported from ${hit.importedFrom}` : undefined,
        hit.originalEnvironment ? `source environment ${compactJson(hit.originalEnvironment)}` : undefined,
      ].filter(Boolean).join(' · ')));
    }
    hits.append(list);
    host.append(hits);
  }
}

export function renderCacheStatus(snapshot: CacheManifestSnapshot): void {
  const host = byId('cache-status');
  if (!host) return;
  clear(host);
  const estimate = snapshot.estimate
    ? `${formatBytes(snapshot.estimate.usage)} used of ${formatBytes(snapshot.estimate.quota)}`
    : 'storage estimate not available';
  host.append(el('p', {}, `Origin ${snapshot.origin}. IndexedDB is isolated by scheme, host, and port; a browser profile does not share this cache across ports.`));
  host.append(el('p', {}, `${snapshot.available ? 'Cache available' : 'Cache unavailable'} · ${snapshot.entryCount} entries · ${snapshot.invalidatedCount} invalidated · ${estimate}.`));
  if (snapshot.importProvenance) {
    host.append(el('p', {}, `Imported from ${snapshot.importProvenance.sourceOrigin} at ${snapshot.importProvenance.importedAtIso}; bundle ${snapshot.importProvenance.contentHash}.`));
  }
  if (snapshot.lastError) host.append(el('p', { class: 'cache-warning' }, snapshot.lastError));
}

function listOrAll(values: readonly string[]): string {
  return values.length > 0 ? values.join(',') : 'all';
}

function formatBytes(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'not available';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'not serializable';
  }
}

export type ResultFilter = 'all' | 'pending' | 'partial' | ResultStatus;

export interface ComparableScenarioRanking {
  status: 'WINNER' | 'TIE' | 'UNRESOLVED' | 'REFUSED';
  winnerEngineId?: string;
  winnerValue?: number;
  metric?: MetricId;
  unit?: string;
  reason: string;
}

export interface FastestRowRanking {
  status: 'WINNER' | 'TIE' | 'UNRESOLVED';
  winnerEngineId?: string;
  winnerMs?: number;
  tiedEngineIds: string[];
  reason: string;
}

/** Engines whose execution time is within this fraction of the fastest are treated as a tie. */
export const FASTEST_TIE_BAND = 0.05;

/**
 * Live row winner by MEASURED execution time. Correctness is binary — only PASS (green) cells with a
 * measured wall time compete, and time is never gated (a slow-but-correct engine still passes). The
 * fastest correct engine wins; engines within FASTEST_TIE_BAND of the fastest are a tie. Every engine
 * runs on its own time — there is no expected/golden time to beat.
 */
export function fastestGreenRowRanking(
  row: readonly { engineId: string; result: ScenarioResult | undefined }[],
): FastestRowRanking {
  if (row.some((entry) => entry.result === undefined)) {
    return { status: 'UNRESOLVED', tiedEngineIds: [], reason: 'Row is still running.' };
  }
  const contenders = row
    .filter((entry) => entry.result!.status === 'PASS')
    .map((entry) => ({ engineId: entry.engineId, ms: pickExecutionMs(entry.result!) }))
    .filter((entry): entry is { engineId: string; ms: number } => typeof entry.ms === 'number')
    .sort((a, b) => a.ms - b.ms || a.engineId.localeCompare(b.engineId));
  if (contenders.length === 0) {
    return { status: 'UNRESOLVED', tiedEngineIds: [], reason: 'No correct, timed engine in this row.' };
  }
  if (contenders.length === 1) {
    // Only one framework produced correct output for this scenario — it wins the row by default.
    return {
      status: 'WINNER',
      winnerEngineId: contenders[0]!.engineId,
      winnerMs: contenders[0]!.ms,
      tiedEngineIds: [],
      reason: 'Only correct engine for this scenario.',
    };
  }
  const best = contenders[0]!.ms;
  const tied = contenders.filter((entry) => entry.ms <= best * (1 + FASTEST_TIE_BAND));
  if (tied.length > 1) {
    return {
      status: 'TIE',
      winnerMs: best,
      tiedEngineIds: tied.map((entry) => entry.engineId),
      reason: `${tied.length} engines within ${FASTEST_TIE_BAND * 100}% of the fastest time.`,
    };
  }
  return {
    status: 'WINNER',
    winnerEngineId: contenders[0]!.engineId,
    winnerMs: best,
    tiedEngineIds: [],
    reason: 'Fastest correct engine for this scenario.',
  };
}

/**
 * UI projection of the authoritative reporting gate. It intentionally has no raw-duration fallback:
 * incomplete or split cohort evidence is a visible refusal, never an inferred live winner.
 */
export function normalizedComparableScenarioRanking(
  results: readonly ScenarioResult[],
): ComparableScenarioRanking {
  if (results.length < 2) {
    return { status: 'REFUSED', reason: 'At least two completed engine rows are required.' };
  }
  const scenarios = new Set(results.map((result) => `${result.browser}\u0000${result.scenarioId}`));
  if (scenarios.size !== 1) {
    return { status: 'REFUSED', reason: 'Results do not describe one browser/scenario row.' };
  }
  try {
    const output = runReportingPipeline({
      results,
      generatedAtIso: '1970-01-01T00:00:00.000Z',
    });
    const decisions = output.cohorts.flatMap((cohort) => cohort.rankings);
    if (decisions.length !== 1) {
      const reasons = output.cohorts.flatMap((cohort) => [
        ...cohort.exclusionReasons,
        ...(cohort.streamingComparability ? [cohort.streamingComparability.detail] : []),
      ]);
      return {
        status: 'REFUSED',
        reason: reasons[0] ?? 'The row is split across unequal or incomplete normalized cohorts.',
      };
    }
    const decision = decisions[0]!;
    if (!decision.comparable) {
      const cohort = output.cohorts[0];
      return {
        status: 'REFUSED',
        reason: cohort?.streamingComparability?.detail
          ?? cohort?.exclusionReasons[0]
          ?? decision.reasons[0]
          ?? 'The normalized cohort gate refused comparison.',
      };
    }
    if (decision.flag === 'winner' && decision.winner) {
      return {
        status: 'WINNER',
        winnerEngineId: decision.winner,
        ...(decision.winnerValue !== null ? { winnerValue: decision.winnerValue } : {}),
        ...(decision.primaryMetric ? { metric: decision.primaryMetric } : {}),
        ...(decision.unit ? { unit: decision.unit } : {}),
        reason: decision.reasons.join(' ') || 'Clear normalized comparable-cohort winner.',
      };
    }
    return {
      status: decision.flag === 'tie' ? 'TIE' : 'UNRESOLVED',
      reason: decision.reasons.join(' ') || 'The comparable cohort has no clear winner.',
    };
  } catch (error) {
    return {
      status: 'REFUSED',
      reason: `Normalized comparison could not be constructed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export class MatrixView {
  private readonly host: HTMLElement;
  private engines: string[] = [];
  private scenarios: string[] = [];
  private results: ScenarioResult[] = [];
  private readonly resultByKey = new Map<string, ScenarioResult>();
  private cells = new Map<string, HTMLTableCellElement>();
  private execOrder: string[] = [];
  private currentKey: string | undefined;
  private finished = false;
  private page = 0;
  private filter: ResultFilter = 'all';
  private winnerKeys = new Set<string>();
  private tieKeys = new Set<string>();
  private wins = new Map<string, number>();
  private raceCols = new Map<string, { col: HTMLElement; bar: HTMLElement; cnt: HTMLElement }>();
  private rankings = new Map<string, ComparableScenarioRanking>();
  private startedAtMs = 0;
  private elapsedTimer = 0;

  constructor(hostId = 'results') {
    this.host = $(hostId);
  }

  start(engines: string[], scenarios: string[], options: { executionOrder?: MatrixCellRef[] } = {}): void {
    this.engines = [...engines];
    // Display rows alphabetically by scenario id (so the table isn't always led by the probe/ family).
    // Execution order below still uses the caller's order — only the rendered row order is sorted.
    this.scenarios = [...scenarios].sort((a, b) => a.localeCompare(b));
    this.results = [];
    this.resultByKey.clear();
    this.cells.clear();
    this.finished = false;
    this.page = 0;
    this.filter = 'all';
    this.winnerKeys.clear();
    this.tieKeys.clear();
    this.wins.clear();
    this.rankings.clear();
    this.execOrder = (options.executionOrder?.length ? options.executionOrder : scenarios.flatMap((scenarioId) =>
      engines.map((engineId) => ({ engineId, scenarioId })))).map((cell) => this.key(cell.engineId, cell.scenarioId));
    this.currentKey = this.execOrder[0];
    this.stopElapsed();
    this.startedAtMs = nowMs();
    this.elapsedTimer = window.setInterval(() => this.renderElapsed(), 500);
    this.buildRace();
    this.renderPage();
    this.renderScoreboard();
  }

  setResultFilter(filter: ResultFilter): void {
    this.filter = filter;
    this.page = 0;
    this.renderPage();
  }

  update(result: ScenarioResult): void {
    const key = this.key(result.engineId, result.scenarioId);
    const prior = this.resultByKey.get(key);
    if (prior) {
      const index = this.results.indexOf(prior);
      if (index >= 0) this.results[index] = result;
    } else {
      this.results.push(result);
    }
    this.resultByKey.set(key, result);
    this.recomputeWinner(result.scenarioId);
    const resolvedCount = this.resultByKey.size;
    this.currentKey = this.execOrder[resolvedCount];
    // Re-render every visible cell in this scenario's row (not just the one that just landed) so the
    // winner/tie highlight appears the moment the row completes — the winning cell may have rendered
    // earlier, before its row had enough results to decide a winner.
    for (const engineId of this.engines) {
      const rowCell = this.cells.get(this.key(engineId, result.scenarioId));
      if (rowCell) this.renderCell(rowCell, engineId, result.scenarioId);
    }
    this.renderCurrentMarker();
    this.renderScoreboard();
  }

  finish(options: { unresolvedState?: 'not-run' | 'pending' } = {}): void {
    // A partial/failed snapshot still has runnable work. Keep its unresolved cells Pending so the
    // terminal view agrees with reload recovery and the "Run remaining with cache" action.
    this.finished = options.unresolvedState !== 'pending';
    this.currentKey = undefined;
    this.stopElapsed();
    this.renderElapsed();
    this.renderPage();
    this.renderScoreboard();
  }

  getResults(): ScenarioResult[] {
    return this.results.slice();
  }

  /** Restore a durable snapshot after reload without pretending that an unfinished run is active. */
  restore(
    engines: string[],
    scenarios: string[],
    results: readonly ScenarioResult[],
    options: { executionOrder?: MatrixCellRef[]; finished?: boolean } = {},
  ): void {
    this.start(engines, scenarios, { executionOrder: options.executionOrder });
    this.results = [...results];
    this.resultByKey.clear();
    for (const result of results) this.resultByKey.set(this.key(result.engineId, result.scenarioId), result);
    this.winnerKeys.clear();
    this.tieKeys.clear();
    this.wins.clear();
    this.rankings.clear();
    for (const scenarioId of this.scenarios) this.recomputeWinner(scenarioId);
    this.stopElapsed();
    this.startedAtMs = 0;
    this.currentKey = undefined;
    this.finished = options.finished === true;
    this.renderPage();
    this.renderScoreboard();
  }

  getRenderedRowCount(): number {
    return this.host.querySelectorAll('tbody tr').length;
  }

  private filteredScenarios(): string[] {
    if (this.filter === 'all') return this.scenarios;
    return this.scenarios.filter((scenarioId) => {
      const row = this.engines.map((engineId) => this.resultByKey.get(this.key(engineId, scenarioId)));
      if (this.filter === 'pending') return row.some((result) => result === undefined);
      if (this.filter === 'partial') return row.some((result) => result?.coverage?.grade === 'partial');
      return row.some((result) => result?.status === this.filter);
    });
  }

  private renderPage(): void {
    clear(this.host);
    this.cells.clear();
    const scenarios = this.filteredScenarios();
    if (this.engines.length === 0 || this.scenarios.length === 0) {
      this.host.append(el('p', { class: 'muted' }, 'Select at least one engine and one scenario.'));
      return;
    }
    if (scenarios.length === 0) {
      this.host.append(el('p', { class: 'muted' }, 'No matrix rows match this result filter.'));
      return;
    }
    const bounds = matrixPageBounds(scenarios.length, this.page);
    this.page = bounds.page;
    const { start, pageCount } = bounds;
    const pageScenarios = scenarios.slice(bounds.start, bounds.end);
    const nav = el('nav', { class: 'matrix-pages', 'aria-label': 'Matrix pages' });
    const previous = el('button', { type: 'button' }, 'Previous rows');
    previous.disabled = this.page === 0;
    previous.addEventListener('click', () => { this.page--; this.renderPage(); });
    const next = el('button', { type: 'button' }, 'Next rows');
    next.disabled = this.page >= pageCount - 1;
    next.addEventListener('click', () => { this.page++; this.renderPage(); });
    nav.append(previous, el('span', {}, `Rows ${start + 1}–${start + pageScenarios.length} of ${scenarios.length} · page ${this.page + 1} of ${pageCount}`), next);
    this.host.append(nav);

    const scroll = el('div', { class: 'matrix-scroll', tabindex: '0', 'aria-label': 'Conformance matrix; scroll horizontally for all engines' });
    const table = el('table', {
      // Positions remain tied to the immutable full model even while a status filter is active.
      'aria-rowcount': String(this.scenarios.length + 1),
      'aria-colcount': String(this.engines.length + 1),
    });
    // Keep each engine column readable at narrow viewports/200% zoom; the focusable wrapper owns
    // horizontal overflow instead of squeezing cell text into an unusable sliver.
    table.style.minWidth = `${Math.max(48, 24 + this.engines.length * 11)}rem`;
    table.append(el('caption', {}, `Conformance verdicts and measured metrics. Showing ${pageScenarios.length} of ${scenarios.length} scenario rows.`));
    const head = el('thead');
    const headRow = el('tr', { 'aria-rowindex': '1' });
    headRow.append(el('th', { scope: 'col', 'aria-colindex': '1' }, 'Scenario'));
    this.engines.forEach((engine, index) => headRow.append(el('th', {
      scope: 'col',
      'aria-colindex': String(index + 2),
    }, engine)));
    head.append(headRow);
    table.append(head);
    const body = el('tbody');
    pageScenarios.forEach((scenarioId, rowIndex) => {
      const logicalIndex = this.scenarios.indexOf(scenarioId);
      const row = el('tr', { 'aria-rowindex': String(logicalIndex + 2) });
      row.append(el('th', { scope: 'row', class: 'scn', 'aria-colindex': '1' }, scenarioId));
      this.engines.forEach((engineId, columnIndex) => {
        const cell = el('td', { 'aria-colindex': String(columnIndex + 2) });
        this.cells.set(this.key(engineId, scenarioId), cell);
        this.renderCell(cell, engineId, scenarioId);
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    scroll.append(table);
    this.host.append(scroll);
  }

  private renderCell(cell: HTMLTableCellElement, engineId: string, scenarioId: string): void {
    clear(cell);
    const key = this.key(engineId, scenarioId);
    const result = this.resultByKey.get(key);
    cell.className = '';
    if (!result) {
      const running = key === this.currentKey;
      cell.classList.toggle('running', running);
      cell.append(el('span', { class: `status ${running ? 'running' : 'muted'}` },
        running ? 'Running — current cell' : this.finished ? 'Not run' : 'Pending'));
      return;
    }
    const display = resultDisplay(result);
    cell.classList.toggle('winner', this.winnerKeys.has(key));
    cell.classList.toggle('tie', this.tieKeys.has(key));
    // Winner/tie are conveyed by the cell background highlight only (td.winner / td.tie) — no label text.
    const primary = el('span', {
      class: `status ${display.kind}`,
      'aria-label': display.accessibleLabel,
    }, display.label);
    cell.append(primary);
    // The whole cell is a fast popup trigger — all details (reason, oracles, per-file evidence) live in a
    // modal so the table stays compact instead of dumping text inline.
    cell.classList.add('has-details');
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.title = 'Click for full details';
    const open = (): void => openCellModal(`${scenarioId} · ${engineId}`, buildResultDetailBody(result, display));
    cell.onclick = open;
    cell.onkeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    };
  }

  private renderCurrentMarker(): void {
    for (const [key, cell] of this.cells) {
      if (!this.resultByKey.has(key)) {
        const [engine, ...scenarioParts] = key.split(' ');
        this.renderCell(cell, engine ?? '', scenarioParts.join(' '));
      }
    }
  }

  private recomputeWinner(scenarioId: string): void {
    // Clear any previous winner/tie marks for this scenario.
    const previous = this.rankings.get(scenarioId);
    if (previous?.status === 'WINNER' && previous.winnerEngineId) {
      this.winnerKeys.delete(this.key(previous.winnerEngineId, scenarioId));
      const engine = shortEngine(previous.winnerEngineId);
      const count = (this.wins.get(engine) ?? 1) - 1;
      if (count > 0) this.wins.set(engine, count);
      else this.wins.delete(engine);
    }
    for (const engineId of this.engines) this.tieKeys.delete(this.key(engineId, scenarioId));
    this.rankings.delete(scenarioId);

    const row = this.engines.map((engineId) => ({ engineId, result: this.resultByKey.get(this.key(engineId, scenarioId)) }));
    const ranking = fastestGreenRowRanking(row);
    this.rankings.set(scenarioId, {
      status: ranking.status,
      ...(ranking.winnerEngineId ? { winnerEngineId: ranking.winnerEngineId } : {}),
      ...(ranking.winnerMs !== undefined ? { winnerValue: ranking.winnerMs } : {}),
      reason: ranking.reason,
    });
    if (ranking.status === 'WINNER' && ranking.winnerEngineId) {
      this.winnerKeys.add(this.key(ranking.winnerEngineId, scenarioId));
      const engine = shortEngine(ranking.winnerEngineId);
      this.wins.set(engine, (this.wins.get(engine) ?? 0) + 1);
    } else if (ranking.status === 'TIE') {
      for (const engineId of ranking.tiedEngineIds) this.tieKeys.add(this.key(engineId, scenarioId));
    }
  }

  private renderScoreboard(): void {
    byId('summary-section')?.removeAttribute('hidden');
    const counts = matrixCounts(this.results);
    const values: Record<string, number> = {
      'stat-total': this.results.length,
      'stat-pass': counts.PASS,
      'stat-fail': counts.FAIL,
      'stat-partial': counts.PARTIAL,
      'stat-error': counts.ERROR,
      'stat-na-engine': counts.NA_ENGINE,
      'stat-na-browser': counts.NA_BROWSER,
      'stat-na-asset': counts.NA_ASSET,
      'stat-na': counts.NA_ENGINE + counts.NA_BROWSER + counts.NA_ASSET,
      'stat-skipped': counts.SKIPPED,
    };
    for (const [id, value] of Object.entries(values)) setText(id, String(value));
    setText('stat-progress', `of ${this.engines.length * this.scenarios.length}`);
    const correctness = correctnessRate(this.results);
    const rate = correctness.denominator > 0
      ? (correctness.numerator / correctness.denominator) * 100
      : undefined;
    setText('stat-passrate', rate === undefined ? 'pending' : `${rate.toFixed(1)}%`);
    const bar = byId<HTMLProgressElement>('passrate-bar');
    if (bar) {
      if (rate === undefined) bar.removeAttribute('value');
      else bar.value = rate;
      bar.setAttribute('aria-label', rate === undefined
        ? 'Correctness-valid result rate pending'
        : `Correctness-valid result rate ${rate.toFixed(1)} percent`);
    }
    this.renderRace();
  }

  /** Build the empty leaderboard chart (one column per framework) into #winner-race. */
  private buildRace(): void {
    const host = byId('winner-race');
    if (!host) return;
    this.raceCols.clear();
    clear(host);
    host.classList.add('race-wrap');
    host.append(el('div', { class: 'race-title' },
      'Winner race — scenarios won (fastest correct framework per fully-reported row)'));
    const chart = el('div', { class: 'race' });
    for (const engineId of this.engines) {
      const short = shortEngine(engineId);
      const bar = el('div', { class: 'race-bar' });
      const cnt = el('div', { class: 'race-cnt' }, '0');
      const col = el('div', { class: 'race-col', title: engineId }, cnt, bar, el('div', { class: 'race-lbl' }, short));
      chart.append(col);
      this.raceCols.set(short, { col, bar, cnt });
    }
    host.append(chart);
    this.renderRace();
  }

  /** Paint the leaderboard: bar height ∝ wins/leader, count label, flex-reorder by wins desc, highlight the leader. */
  private renderRace(): void {
    if (this.raceCols.size === 0) return;
    let max = 0;
    for (const count of this.wins.values()) if (count > max) max = count;
    const ranked = [...this.raceCols.keys()].sort((a, b) => (this.wins.get(b) ?? 0) - (this.wins.get(a) ?? 0));
    ranked.forEach((short, rank) => {
      const node = this.raceCols.get(short);
      if (!node) return;
      const wins = this.wins.get(short) ?? 0;
      node.col.style.order = String(rank);
      node.col.classList.toggle('leading', wins > 0 && wins === max);
      node.bar.style.height = `${max > 0 ? Math.round((wins / max) * 100) : 0}%`;
      node.cnt.textContent = String(wins);
    });
  }

  private renderElapsed(): void {
    const node = byId('stat-elapsed');
    if (!node || !this.startedAtMs) return;
    const seconds = Math.max(0, (nowMs() - this.startedAtMs) / 1000);
    node.textContent = seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  }

  private stopElapsed(): void {
    if (this.elapsedTimer) window.clearInterval(this.elapsedTimer);
    this.elapsedTimer = 0;
  }

  private key(engineId: string, scenarioId: string): string {
    return `${shortEngine(engineId)} ${scenarioId}`;
  }
}

interface ResultDisplay {
  kind: ResultStatus | 'PARTIAL';
  label: string;
  accessibleLabel: string;
  partialFailures: string[];
}

export function resultDisplay(result: ScenarioResult): ResultDisplay {
  if (result.coverage?.grade === 'partial') {
    const valid = result.coverage.valid ?? result.coverage.passed;
    const failures = (result.exhaustive ?? [])
      .filter((file) => file.status !== 'PASS')
      .map((file) => `${file.file}: ${formatStatusLabel(file.status)}${file.reason ? ` — ${file.reason}` : ''}`);
    const ms = pickExecutionMs(result);
    const timing = ms === undefined ? '' : ` (${formatExecTime(ms)})`;
    const label = `Partial ${valid}/${result.coverage.total}${timing}`;
    return { kind: 'PARTIAL', label, accessibleLabel: `${label}. Mixed file coverage.`, partialFailures: failures };
  }
  // PASS, FAIL, and ERROR all represent work that reached an executable boundary. Keep their elapsed
  // cost visible when the runner measured one; a semantic failure must not erase how long it ran.
  const ms = result.status === 'PASS' || result.status === 'FAIL' || result.status === 'ERROR'
    ? pickExecutionMs(result)
    : undefined;
  const metric = ms === undefined ? '' : ` (${formatExecTime(ms)})`;
  const label = `${formatStatusLabel(result.status)}${metric}`;
  const accessibleLabel = result.status === 'FAIL'
    ? `${label}. True semantic or structural violation.`
    : label;
  return { kind: result.status, label, accessibleLabel, partialFailures: [] };
}

export function formatStatusLabel(status: ResultStatus): string {
  switch (status) {
    case 'PASS': return 'PASS';
    case 'FAIL': return 'FAIL';
    case 'NA_ENGINE': return 'NA_ENGINE';
    case 'NA_BROWSER': return 'NA_BROWSER';
    case 'NA_ASSET': return 'NA_ASSET';
    case 'SKIPPED': return 'SKIPPED';
    case 'ERROR': return 'ERROR';
  }
}

/** The full detail content for one cell, shown inside the fast popup (no <details> wrapper). */
function buildResultDetailBody(result: ScenarioResult, display: ResultDisplay): HTMLElement {
  const body = el('div', { class: 'cell-details' });
  const list = el('dl', { class: 'detail-grid' });
  const row = (term: string, description: string): void => list.append(el('dt', {}, term), el('dd', {}, description));
  row('Verdict/status', display.accessibleLabel);
  row('Reason', resultReason(result));
  row('Metric', metricDescription(result));
  row('Cache', cacheDescription(result));
  row('Selected input', selectionDescription(result));
  row('Environment', resultEnvironmentDescription(result));
  row('Started', result.startedAtIso ?? 'not available');
  row('Duration', typeof result.durationMs === 'number' && Number.isFinite(result.durationMs)
    ? formatExecTime(result.durationMs)
    : 'not measured');
  body.append(list);
  if (display.partialFailures.length > 0) {
    body.append(el('h4', {}, 'Files without a valid result'));
    const failures = el('ul', { class: 'partial-files' });
    for (const failure of display.partialFailures) failures.append(el('li', {}, failure));
    body.append(failures);
  }
  const oracleHeading = el('h4', {}, 'Oracle outcomes');
  const oracleList = el('ul');
  if (result.oracleOutcomes.length === 0) oracleList.append(el('li', {}, 'No oracle outcome was available.'));
  for (const outcome of result.oracleOutcomes) {
    const state = outcome.state === 'VERDICT' ? outcome.verdict : outcome.state === 'UNAVAILABLE' ? outcome.status : 'ERROR';
    const detail = outcome.detail ? ` — ${outcome.detail}` : '';
    oracleList.append(el('li', {}, `${outcome.oracle}: ${state}${detail}`));
  }
  body.append(oracleHeading, oracleList);
  if (result.exhaustive?.length) {
    body.append(el('h4', {}, 'Per-file evidence'));
    const files = el('ul');
    for (const file of result.exhaustive) {
      files.append(el('li', {}, [
        file.file,
        file.status,
        `SHA-256 ${file.sha256 ?? 'not available'}`,
        file.reason,
        `metric: ${metricEvidenceDescription(file.status, undefined, file.bench, file.measurement)}`,
      ].filter(Boolean).join(' · ')));
    }
    body.append(files);
  }
  return body;
}

// ── fast cell-details popup ──────────────────────────────────────────────────────────────────
// A single reusable modal, toggled via the `hidden` attribute (no per-open rebuild, no transition) so
// it opens and closes instantly. Backdrop click, the × button, and Escape all close it.

let cellModalEl: HTMLElement | undefined;
let cellModalKeyHandler: ((event: KeyboardEvent) => void) | undefined;

function ensureCellModal(): { root: HTMLElement; title: HTMLElement; body: HTMLElement } {
  const existing = cellModalEl;
  if (existing) {
    return {
      root: existing,
      title: existing.querySelector('.cell-modal-title') as HTMLElement,
      body: existing.querySelector('.cell-modal-body') as HTMLElement,
    };
  }
  const title = el('h3', { class: 'cell-modal-title', id: 'cell-modal-title' });
  const closeBtn = el('button', { type: 'button', class: 'cell-modal-close', 'aria-label': 'Close details' }, '×');
  const body = el('div', { class: 'cell-modal-body' });
  const panel = el('div', {
    class: 'cell-modal-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cell-modal-title',
  }, el('div', { class: 'cell-modal-head' }, title, closeBtn), body);
  const backdrop = el('div', { class: 'cell-modal-backdrop' });
  const root = el('div', { class: 'cell-modal', hidden: 'hidden' }, backdrop, panel);
  backdrop.addEventListener('click', closeCellModal);
  closeBtn.addEventListener('click', closeCellModal);
  document.body.append(root);
  cellModalEl = root;
  return { root, title, body };
}

export function openCellModal(titleText: string, content: HTMLElement): void {
  const { root, title, body } = ensureCellModal();
  title.textContent = titleText;
  clear(body);
  body.append(content);
  root.removeAttribute('hidden');
  if (!cellModalKeyHandler) {
    cellModalKeyHandler = (event: KeyboardEvent): void => { if (event.key === 'Escape') closeCellModal(); };
    document.addEventListener('keydown', cellModalKeyHandler);
  }
}

export function closeCellModal(): void {
  const root = cellModalEl;
  if (!root) return;
  root.setAttribute('hidden', 'hidden');
  clear(root.querySelector('.cell-modal-body') as HTMLElement);
  if (cellModalKeyHandler) {
    document.removeEventListener('keydown', cellModalKeyHandler);
    cellModalKeyHandler = undefined;
  }
}

function resultReason(result: ScenarioResult): string {
  if (result.status === 'FAIL') return `True semantic or structural violation: ${result.reason ?? firstOracleDetail(result) ?? 'see oracle outcomes'}`;
  if (result.status === 'NA_ENGINE') {
    const declared = result.support?.decision.supported === false || /does not declare|capability gate/i.test(result.reason ?? '');
    return `${declared ? 'Declared capability gate' : 'Runtime NotApplicableError for the concrete combination'}: ${result.reason ?? 'not applicable'}`;
  }
  return result.reason ?? firstOracleDetail(result) ?? 'No additional reason was supplied.';
}

function firstOracleDetail(result: ScenarioResult): string | undefined {
  return result.oracleOutcomes.find((outcome) => outcome.detail)?.detail;
}

function metricDescription(result: ScenarioResult): string {
  return metricEvidenceDescription(result.status, result.coverage, result.bench, result.measurement);
}

function metricEvidenceDescription(
  status: ResultStatus,
  coverage: ScenarioResult['coverage'],
  bench: ScenarioResult['bench'],
  measurement: ScenarioResult['measurement'],
): string {
  const entries: string[] = [];
  for (const [metric, summary] of Object.entries(bench ?? {})) {
    if (!summary) continue;
    const ranked = summary.aggregate ?? summary.median;
    if (typeof ranked === 'number' && Number.isFinite(ranked)) {
      entries.push(`${metric}: ${ranked} ${summary.unit} (${summary.n} measured sample${summary.n === 1 ? '' : 's'})`);
    }
  }
  if (coverage?.grade === 'partial') {
    return entries.length > 0
      ? `diagnostic for correctness-valid files only; not benchmark eligible — ${entries.join('; ')}`
      : 'not measured — partial coverage is not benchmark eligible';
  }
  if (status !== 'PASS') {
    return `not measured — ${status} is not benchmark eligible`;
  }
  if (entries.length > 0) return entries.join('; ');
  if (measurement?.state === 'UNAVAILABLE') return `not measured — ${measurement.detail}`;
  return 'not measured';
}

function cacheDescription(result: ScenarioResult): string {
  const reuse = (result as ScenarioResult & { cacheReuse?: Record<string, unknown> }).cacheReuse;
  if (!reuse) return 'fresh execution';
  return [
    `cache hit from run ${String(reuse.sourceRunId ?? 'unknown')}`,
    `created ${String(reuse.createdAtIso ?? 'unknown')}`,
    `origin ${String(reuse.originalOrigin ?? 'unknown')}`,
    `epoch ${String(reuse.validationEpoch ?? 'unknown')}`,
    String(reuse.validBecause ?? 'validated'),
    reuse.importedFrom ? `imported from ${String(reuse.importedFrom)}` : undefined,
    reuse.sourceEnvironment ? `source environment ${compactJson(reuse.sourceEnvironment)}` : undefined,
  ].filter(Boolean).join('; ');
}

function selectionDescription(result: ScenarioResult): string {
  if (result.exhaustive?.length) {
    return `${result.exhaustive.length} variants: ${result.exhaustive.map((file) => `${file.file} (${file.sha256 ?? 'SHA unavailable'})`).join(', ')}`;
  }
  const selection = result.selection;
  return selection
    ? `${selection.file}; candidate ${selection.candidateCount ?? 'unknown'} of catalog; SHA-256 ${selection.sha256 ?? 'not available'}`
    : 'not available';
}

function resultEnvironmentDescription(result: ScenarioResult): string {
  const environment = result.env;
  if (!environment) return 'not available';
  return [
    `suite ${environment.suiteVersion}`,
    `${environment.browser}${environment.browserVersion ? ` ${environment.browserVersion}` : ''}`,
    `user agent ${environment.userAgent ?? 'not available'}`,
    `GPU ${environment.gpu ?? 'not available'}`,
    `corpus ${environment.corpusChecksum ?? 'not available'}`,
    `engine config ${environment.configUsed === undefined ? 'not reported' : compactJson(environment.configUsed)}`,
    environment.pixelBehavior ? `pixel behavior ${compactJson(environment.pixelBehavior)}` : undefined,
  ].filter(Boolean).join('; ');
}

function matrixCounts(results: readonly ScenarioResult[]): Record<ResultStatus | 'PARTIAL', number> {
  const counts = {
    PASS: 0, FAIL: 0, PARTIAL: 0, NA_ENGINE: 0, NA_BROWSER: 0,
    NA_ASSET: 0, SKIPPED: 0, ERROR: 0,
  } satisfies Record<ResultStatus | 'PARTIAL', number>;
  for (const result of results) {
    if (result.coverage?.grade === 'partial') counts.PARTIAL++;
    else counts[result.status]++;
  }
  return counts;
}

/** File-aware correctness rate: partial exhaustive cells contribute their retained numerator/denominator. */
export function correctnessRate(results: readonly ScenarioResult[]): { numerator: number; denominator: number } {
  let numerator = 0;
  let denominator = 0;
  for (const result of results) {
    if (result.coverage) {
      numerator += result.coverage.counts.pass;
      denominator += result.coverage.counts.pass + result.coverage.counts.fail;
      continue;
    }
    if (result.status === 'PASS') {
      numerator++;
      denominator++;
    } else if (result.status === 'FAIL') {
      denominator++;
    }
  }
  return { numerator, denominator };
}

let lastProgressAnnouncement = '';
let lastProgressBucket = -1;

export function setProgress(done: number, total: number, label: string): void {
  const progress = $('run-progress') as HTMLProgressElement;
  progress.hidden = false;
  progress.max = Math.max(1, total);
  progress.value = Math.max(0, Math.min(done, total));
  progress.setAttribute('aria-valuetext', `${done} of ${total}; ${label}`);
  $('progress-label').textContent = `${done} of ${total} — ${label}`;
  const bucket = total > 0 ? Math.floor((done / total) * 10) : 0;
  if (bucket !== lastProgressBucket || done === total) {
    lastProgressBucket = bucket;
    announceStatus(`${done} of ${total} completed.`);
  }
}

export function hideProgress(): void {
  const progress = $('run-progress') as HTMLProgressElement;
  progress.hidden = true;
  hideFileProgress();
}

export function setFileProgress(completed: number, total: number, label: string): void {
  const group = $('file-progress-group');
  const progress = $('file-progress') as HTMLProgressElement;
  group.hidden = false;
  progress.max = Math.max(1, total);
  progress.value = Math.max(0, Math.min(completed, total));
  progress.setAttribute('aria-valuetext', `${completed} of ${total}; ${label}`);
  $('file-progress-label').textContent = `${completed} of ${total} inputs resolved — ${label}`;
}

export function hideFileProgress(): void {
  byId('file-progress-group')?.setAttribute('hidden', '');
}

export function setRunStatus(text: string): void {
  $('run-status').textContent = text;
  announceStatus(text);
}

export function announceStatus(text: string): void {
  const normalized = text.trim();
  if (!normalized || normalized === lastProgressAnnouncement) return;
  lastProgressAnnouncement = normalized;
  const live = byId('live-status');
  if (live) live.textContent = normalized;
}

export function setRunState(state: string): void {
  document.body.dataset.runState = state;
}

export function focusRunControl(): void {
  byId<HTMLButtonElement>('run')?.focus({ preventScroll: true });
}

export function setCurrentWork(text: string): void {
  const node = byId('current-work');
  if (node) node.textContent = text;
}

function setText(id: string, text: string): void {
  const node = byId(id);
  if (node) node.textContent = text;
}

function shortEngine(engineId: string): string {
  return engineId.split('@')[0] ?? engineId;
}

function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export { $ as getEl };
