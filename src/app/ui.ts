/**
 * src/app/ui.ts — vanilla-DOM rendering for the in-page suite (§4). No framework, no deps.
 *
 * Pure view layer: it builds the engine/scenario pickers, renders the environment + codec-support
 * panel, and folds the stream of {@link ScenarioResult} into a live conformance matrix with the
 * per-cell metric summary. main.ts owns orchestration (registration + runMatrix) and calls into
 * here; ui.ts never imports the runner or the registry, so it stays trivially testable.
 */

import type { EnvInfo, CodecSupport } from '../core/feature-detect.ts';
import type { ScenarioResult } from '../core/scenario.ts';
import { visibleResult } from '../core/format.ts';

// ── small DOM helpers ─────────────────────────────────────────────────────────────────────────

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id} in index.html`);
  return el as T;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

function clear(node: HTMLElement): void {
  node.replaceChildren();
}

// ── optional / cosmetic element helpers ──────────────────────────────────────────────────────
// The hero chips and live scoreboard are presentation sugar (index.html). Look them up without
// throwing so the suite still runs if the markup is stripped or replaced — a run must never depend
// on a decorative node existing.

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Repaint a hero chip: leading status dot + content nodes, with an on/off colour state. */
function fillChip(id: string, content: (Node | string)[], state?: 'ok' | 'off'): void {
  const chip = byId(id);
  if (!chip) return;
  clear(chip);
  chip.append(el('span', { class: 'dot' }));
  for (const c of content) chip.append(typeof c === 'string' ? document.createTextNode(c) : c);
  chip.classList.remove('ok', 'off');
  if (state) chip.classList.add(state);
}

// ── environment + codec support panel ───────────────────────────────────────────────────────

export function renderEnv(env: EnvInfo, support: CodecSupport): void {
  const host = $('env');
  clear(host);

  const grid = el('dl', { class: 'env-grid' });
  const row = (k: string, v: string): void => {
    grid.append(el('dt', {}, k), el('dd', {}, v));
  };
  row('Browser', `${env.browser}${env.version ? ` ${env.version}` : ''}`);
  if (env.gpu) row('GPU', env.gpu);
  row('WebCodecs', support.webcodecs ? 'available' : 'absent');
  row('WebGPU', support.webgpu ? 'available' : 'absent');
  row('Alpha decode', support.alpha ? 'yes' : 'no');
  row('measureMemory', support.measureMemory ? 'available' : 'absent (peak-mem fallback / omitted)');
  row('User agent', env.userAgent || '—');
  host.append(grid);

  host.append(codecPills('Video decode', support.videoDecode));
  host.append(codecPills('Video encode', support.videoEncode));
  host.append(codecPills('Audio decode', support.audioDecode));
  host.append(codecPills('Audio encode', support.audioEncode));

  // Mirror the headline facts into the hero chips so the page reads at a glance before any run.
  fillChip('chip-browser', [`${env.browser}${env.version ? ` ${env.version}` : ''}`], 'ok');
  fillChip(
    'chip-webcodecs',
    [support.webcodecs ? 'WebCodecs ready' : 'WebCodecs absent'],
    support.webcodecs ? 'ok' : 'off',
  );
}

function codecPills(label: string, map: Record<string, boolean>): HTMLElement {
  const wrap = el('div', { class: 'codec-pills' });
  wrap.append(el('span', { class: 'muted', style: 'font-size:0.72rem;align-self:center' }, `${label}:`));
  for (const [token, ok] of Object.entries(map)) {
    wrap.append(el('span', { class: `pill ${ok ? 'yes' : 'no'}`, title: ok ? 'supported' : 'unsupported' }, token));
  }
  return wrap;
}

// ── engine + scenario pickers ──────────────────────────────────────────────────────────────────

export interface PickerItem {
  id: string;
  label: string;
  /** disabled items (e.g. an engine that failed to register) render greyed + unchecked. */
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

/** Render a checkbox list into a container; returns a getter for the currently-checked ids. */
function renderChecklist(containerId: string, name: string, items: PickerItem[]): () => string[] {
  const host = $(containerId);
  clear(host);
  if (items.length === 0) {
    host.append(el('span', { class: 'muted' }, 'none available'));
    return () => [];
  }
  for (const item of items) {
    const cb = el('input', { type: 'checkbox', value: item.id });
    cb.setAttribute('data-group', name);
    if (item.checked !== false && !item.disabled) cb.setAttribute('checked', 'checked');
    if (item.disabled) cb.setAttribute('disabled', 'disabled');
    const lbl = el('label', { class: 'opt', ...(item.title ? { title: item.title } : {}) }, cb, ` ${item.label}`);
    host.append(lbl);
  }
  return () =>
    [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
      .filter((c) => c.checked && !c.disabled)
      .map((c) => c.value);
}

export function renderEnginePicker(items: PickerItem[]): () => string[] {
  const registered = items.filter((i) => !i.disabled).length;
  fillChip('chip-engines', [el('b', {}, String(registered)), ' engines'], 'ok');
  return renderChecklist('engines-list', 'engine', items);
}

export function renderFeaturePicker(items: FeaturePickerItem[]): () => string[] {
  return renderChecklist(
    'features-list',
    'feature',
    items.map((item) => ({
      id: item.id,
      label: `${item.label} (${item.count})`,
      title: item.title,
      checked: item.checked,
    })),
  );
}

export function renderScenarioPicker(items: PickerItem[]): () => string[] {
  fillChip('chip-scenarios', [el('b', {}, String(items.length)), ' scenarios'], 'ok');
  return renderChecklist('scenarios-list', 'scenario', items);
}

/** Tick/untick every enabled checkbox in a group (the "All …" buttons). */
export function setAllChecked(containerId: string, checked: boolean): void {
  const host = $(containerId);
  for (const c of host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
    if (!c.disabled) c.checked = checked;
  }
}

// ── live conformance matrix + metrics ───────────────────────────────────────────────────────────

// ── live scoreboard helpers (cosmetic; never throw) ──────────────────────────────────────────

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/** Human elapsed: `12.4s` under a minute, `2m 05s` beyond it. */
function fmtElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

/** Set a node's text without any animation (resets, ticking clock). */
function setText(id: string, value: string): void {
  const node = byId(id);
  if (node) node.textContent = value;
}

/** Set a scoreboard number and re-trigger its bump pulse — only when the value actually changes. */
function setStatNum(id: string, value: number): void {
  const node = byId(id);
  if (!node) return;
  const next = String(value);
  if (node.textContent === next) return;
  node.textContent = next;
  node.classList.remove('bump');
  void node.offsetWidth; // force reflow so the keyframe restarts on every change
  node.classList.add('bump');
}

/**
 * Incremental matrix renderer. `start(engines, scenarios)` lays out the empty grid; `update(result)`
 * fills the cell for one (engine, scenario) as results stream in from the runner's `onResult`.
 *
 * It also drives the live scoreboard (#summary-section): a rAF-coalesced tally of PASS/FAIL/ERROR/
 * NA/SKIPPED, a pass-rate bar, and an elapsed clock. All of that is decorative — guarded so a run
 * never breaks if the scoreboard markup is absent.
 */
export class MatrixView {
  private readonly host: HTMLElement;
  private engines: string[] = [];
  private scenarios: string[] = [];
  /** cellKey `${engineId} ${scenarioId}` -> the <td> to fill. */
  private cells = new Map<string, HTMLTableCellElement>();
  private results: ScenarioResult[] = [];
  /**
   * The order the runner (runMatrix) actually executes cells in: scenario-major, i.e. for each
   * feature/scenario, every engine in turn. We can't see a
   * "cell started" hook from the core, so we derive the in-flight cell from this order: the cell
   * after the most recently-resolved one is the one currently executing. This is best-effort UX —
   * keyed off the resolved result so a real status always lands even if ordering is imperfect.
   */
  private execOrder: string[] = [];
  /** cellKeys that have received a real result (so we never re-mark a finished cell as running). */
  private resolved = new Set<string>();
  /** the <td> currently flagged as running, so we can clear it when the next result arrives. */
  private runningCell: HTMLTableCellElement | null = null;
  /** scoreboard bookkeeping: run start (performance.now), the elapsed-clock interval, the pending rAF. */
  private startedAtMs = 0;
  private elapsedTimer = 0;
  private scoreboardRaf = 0;

  constructor(hostId = 'results') {
    this.host = $(hostId);
  }

  /** Lay out an empty engine × scenario grid (scenarios as rows, engines as columns). */
  start(engines: string[], scenarios: string[]): void {
    this.engines = engines;
    this.scenarios = scenarios;
    this.cells.clear();
    this.results = [];
    this.resolved.clear();
    this.runningCell = null;
    this.stopScoreboardTimers();
    // Mirror runMatrix's scenario-major iteration so we can guess the in-flight cell from order.
    this.execOrder = [];
    for (const s of scenarios) for (const e of engines) this.execOrder.push(this.key(e, s));
    clear(this.host);

    if (engines.length === 0 || scenarios.length === 0) {
      byId('summary-section')?.setAttribute('hidden', '');
      this.host.append(el('p', { class: 'muted' }, 'Select at least one engine and one scenario.'));
      return;
    }

    const table = el('table');
    const thead = el('thead');
    const headRow = el('tr');
    headRow.append(el('th', {}, 'Scenario'));
    for (const e of engines) headRow.append(el('th', {}, e));
    thead.append(headRow);
    table.append(thead);

    const tbody = el('tbody');
    for (const s of scenarios) {
      const tr = el('tr');
      tr.append(el('td', { class: 'scn' }, s));
      for (const e of engines) {
        const td = el('td');
        td.append(el('span', { class: 'status muted' }, '·'));
        this.cells.set(this.key(e, s), td);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    this.host.append(table);

    // The runner starts the very first cell the moment runMatrix is called — flag it live now.
    this.markRunning(this.execOrder[0]);
    this.initScoreboard();
  }

  // ── live scoreboard ───────────────────────────────────────────────────────────────────────
  // Reveal #summary-section, zero the cards, and start an elapsed clock. The tally itself is
  // recomputed from `this.results` and flushed at most once per animation frame (`update` can fire
  // thousands of times for a full matrix, so we coalesce the DOM writes).

  private initScoreboard(): void {
    byId('summary-section')?.removeAttribute('hidden');
    setText('stat-total', '0');
    setText('stat-pass', '0');
    setText('stat-fail', '0');
    setText('stat-error', '0');
    setText('stat-na', '0');
    setText('stat-skipped', '0');
    setText('stat-elapsed', '0.0s');
    setText('stat-passrate', '—');
    const cells = this.engines.length * this.scenarios.length;
    setText('stat-progress', cells ? `of ${cells}` : ' ');
    const bar = byId('passrate-bar');
    if (bar) bar.style.width = '0%';
    this.startedAtMs = nowMs();
    this.tickElapsed();
    this.elapsedTimer = window.setInterval(() => this.tickElapsed(), 200);
  }

  private tickElapsed(): void {
    if (!this.startedAtMs) return;
    setText('stat-elapsed', fmtElapsed(nowMs() - this.startedAtMs));
  }

  private stopScoreboardTimers(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = 0;
    }
    if (this.scoreboardRaf) {
      cancelAnimationFrame(this.scoreboardRaf);
      this.scoreboardRaf = 0;
    }
  }

  /** Queue a scoreboard repaint for the next frame (idempotent within a frame). */
  private scheduleScoreboardFlush(): void {
    if (this.scoreboardRaf) return;
    this.scoreboardRaf = requestAnimationFrame(() => {
      this.scoreboardRaf = 0;
      try {
        this.flushScoreboard();
      } catch {
        /* scoreboard is cosmetic — never let it break a run */
      }
    });
  }

  /** Recompute the tally from all results so far and paint the cards + pass-rate bar. */
  private flushScoreboard(): void {
    let pass = 0;
    let fail = 0;
    let error = 0;
    let na = 0;
    let skip = 0;
    for (const r of this.results) {
      switch (r.status) {
        case 'PASS':
          pass++;
          break;
        case 'FAIL':
          fail++;
          break;
        case 'ERROR':
          error++;
          break;
        case 'SKIPPED':
          skip++;
          break;
        default:
          na++; // NA_ENGINE | NA_BROWSER | NA_ASSET — grouped in the headline, split in raw results
      }
    }
    setStatNum('stat-total', this.results.length);
    setStatNum('stat-pass', pass);
    setStatNum('stat-fail', fail);
    setStatNum('stat-error', error);
    setStatNum('stat-na', na);
    setStatNum('stat-skipped', skip);

    // Pass rate is over *applicable* cells only (PASS+FAIL+ERROR): NA/SKIPPED aren't failures.
    const applicable = pass + fail + error;
    const rate = applicable > 0 ? Math.round((pass / applicable) * 100) : 0;
    setText('stat-passrate', applicable > 0 ? `${rate}%` : '—');
    const bar = byId('passrate-bar');
    if (bar) bar.style.width = `${rate}%`;
  }

  /**
   * Flag a cell as currently executing: blue spinner + pulsing tint. Clears any previously-running
   * cell first. A null/undefined/already-resolved key just clears the marker (no-op otherwise).
   * Never throws — animation is purely cosmetic and must never break a run.
   */
  private markRunning(cellKey: string | undefined): void {
    // Clear the previous running cell back to its placeholder dot (unless a result already filled it).
    if (this.runningCell) {
      this.runningCell.classList.remove('running');
      this.runningCell = null;
    }
    if (!cellKey || this.resolved.has(cellKey)) return;
    const td = this.cells.get(cellKey);
    if (!td) return;
    clear(td);
    const status = el('span', { class: 'status running' });
    status.append(el('span', { class: 'spinner' }), document.createTextNode('running'));
    td.append(status);
    td.classList.add('running');
    this.runningCell = td;
  }

  /** Advance the in-flight marker to the next not-yet-resolved cell after the resolved ones. */
  private advanceRunning(): void {
    const next = this.execOrder.find((k) => !this.resolved.has(k));
    this.markRunning(next);
  }

  /**
   * Clear any lingering running indicator (called when the whole run ends). Cells that never
   * resolved fall back to their "·" placeholder so a partial/aborted run reads honestly.
   */
  finish(): void {
    if (this.runningCell) {
      this.runningCell.classList.remove('running');
      // If this cell never got a real result, restore the muted placeholder.
      const key = [...this.cells.entries()].find(([, td]) => td === this.runningCell)?.[0];
      if (key && !this.resolved.has(key)) {
        clear(this.runningCell);
        this.runningCell.append(el('span', { class: 'status muted' }, '·'));
      }
      this.runningCell = null;
    }
    // Freeze the elapsed clock and paint a final, exact tally (no pending rAF can race the run end).
    this.stopScoreboardTimers();
    this.tickElapsed();
    try {
      this.flushScoreboard();
    } catch {
      /* cosmetic */
    }
  }

  /** Fill the cell for a streamed result. */
  update(r: ScenarioResult): void {
    this.results.push(r);
    this.scheduleScoreboardFlush();
    // Mark this cell resolved (in execution-order terms) and advance the in-flight marker to the
    // next pending cell — done before the early-return so the spinner always moves on, even if the
    // result's (engineId, scenarioId) doesn't map to a drawn cell.
    const cellKey = this.key(r.engineId, r.scenarioId);
    this.resolved.add(cellKey);
    const td = this.cells.get(cellKey);
    if (!td) {
      this.advanceRunning();
      return;
    }
    // If this was the cell flagged running, drop the flag before we overwrite it with the result.
    if (this.runningCell === td) {
      td.classList.remove('running');
      this.runningCell = null;
    }
    clear(td);
    // Flash the cell accent as the verdict lands; the verdict text fades in over it.
    td.classList.add('flash');

    const status = el('span', { class: `status ${r.status} pop` }, visibleResult(r));
    if (r.reason) status.setAttribute('title', r.reason);
    td.append(status);

    // This cell is done; light up whichever cell the runner is now working on.
    this.advanceRunning();
  }

  /** All results gathered so far (the runner returns these too; this is the live mirror). */
  getResults(): ScenarioResult[] {
    return this.results.slice();
  }

  private key(engineId: string, scenarioId: string): string {
    return `${engineId} ${scenarioId}`;
  }
}

// ── progress + status ─────────────────────────────────────────────────────────────────────────

export function setProgress(done: number, total: number, label: string): void {
  const wrap = $('progress-wrap');
  const bar = $('progress-bar');
  const lbl = $('progress-label');
  wrap.style.display = 'block';
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  bar.style.width = `${pct}%`;
  // Rebuild via DOM so we can keep an animated spinner element while the run is in progress; once
  // every cell has reported (done >= total) the run is finishing, so drop the spinner.
  clear(lbl);
  if (total > 0 && done < total) lbl.append(el('span', { class: 'spinner' }));
  lbl.append(document.createTextNode(`${done}/${total} — ${label}`));
}

export function hideProgress(): void {
  $('progress-wrap').style.display = 'none';
  clear($('progress-label'));
}

export function setRunStatus(text: string): void {
  $('run-status').textContent = text;
}

export function renderRegistrationBanner(lines: string[]): void {
  if (lines.length === 0) return;
  const section = $('controls-section');
  const banner = el('div', { class: 'banner' });
  banner.append(el('strong', {}, 'Registration notes: '));
  banner.append(document.createTextNode(lines.join(' · ')));
  section.append(banner);
}

export { $ as getEl };
