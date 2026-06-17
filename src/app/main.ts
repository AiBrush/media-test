/**
 * src/app/main.ts — in-page orchestration (§4, §2). Browser-only TS; no Node, no binary.
 *
 * Boot sequence:
 *   1. detectEnv + detectCodecSupport → render the environment / codec-support panel.
 *   2. registerAll() → wire every engine adapter + scenario family into the registry (defensively).
 *   3. build the engine + scenario pickers from the registry.
 *   4. wire the Run button → runMatrix(...) with live onResult/onProgress callbacks streaming into
 *      the MatrixView; on completion, expose results for the Playwright launcher + enable download.
 *
 * The launcher (scripts/launch.mjs) drives this page headlessly: it reads `window.__SUITE__` to
 * trigger a run with filters and awaits `window.__RESULTS__` (set when a run finishes). The page is
 * fully usable by hand too — opening it and clicking Run does the same thing.
 */

import { detectEnv, detectCodecSupport } from '../core/feature-detect.ts';
import type { EnvInfo, CodecSupport } from '../core/feature-detect.ts';
import { listEngines, listScenarios, getReferenceEngineId } from '../core/registry.ts';
import { runMatrix } from '../core/runner.ts';
import type { RunOptions } from '../core/runner.ts';
import type { BrowserName } from '../core/engine.ts';
import type { ScenarioResult } from '../core/scenario.ts';
import { registerAll } from './register.ts';
import type { RegistrationReport } from './register.ts';
import {
  renderEnv,
  renderEnginePicker,
  renderScenarioPicker,
  setAllChecked,
  renderRegistrationBanner,
  MatrixView,
  setProgress,
  hideProgress,
  setRunStatus,
  getEl,
} from './ui.ts';

/** The control surface the headless launcher (Playwright) uses to drive a run programmatically. */
interface SuiteControl {
  /** trigger a run; resolves with the results array (also stashed on window.__RESULTS__). */
  run(filter?: SuiteRunFilter): Promise<ScenarioResult[]>;
  /** the detected environment + codec support, for the launcher to record. */
  env: EnvInfo;
  support: CodecSupport;
  registration: RegistrationReport;
  referenceEngineId: string;
  /** all registered ids, so the launcher can resolve --engine/--pillar against reality. */
  engineIds: string[];
  scenarioIds: string[];
  ready: true;
}

interface SuiteRunFilter {
  engineIds?: string[];
  scenarioIds?: string[];
  pillar?: RunOptions['pillar'];
  browser?: BrowserName;
  warmup?: number;
  iters?: number;
}

declare global {
  interface Window {
    __SUITE__?: SuiteControl;
    __RESULTS__?: ScenarioResult[];
    /** set true the moment a run completes — a simple flag the launcher can poll. */
    __RUN_DONE__?: boolean;
    /** set if boot failed, so the launcher fails fast instead of hanging. */
    __SUITE_ERROR__?: string;
  }
}

let env: EnvInfo;
let support: CodecSupport;
let registration: RegistrationReport;
let getCheckedEngines: () => string[] = () => [];
let getCheckedScenarios: () => string[] = () => [];
const matrix = new MatrixView('results');

async function boot(): Promise<void> {
  // 1. Environment + codec support (defensive — never throws).
  [env, support] = await Promise.all([detectEnv(), detectCodecSupport()]);
  renderEnv(env, support);

  // 2. Register engines + scenarios (tolerant of broken/missing modules).
  registration = await registerAll();

  // 3. Build pickers from the registry.
  const referenceEngineId = getReferenceEngineId();
  const enginePickers = listEngines().map((e) => ({
    id: e.id,
    label: e.id === referenceEngineId ? `${e.id} (ref)` : e.id,
  }));
  // Surface engines that failed to register as disabled rows so the gap is visible, not silent.
  for (const e of registration.engines) {
    if (!e.ok) enginePickers.push({ id: `(failed) ${e.id}`, label: `${e.id} — failed: ${e.reason ?? '?'}` });
  }
  getCheckedEngines = renderEnginePicker(
    enginePickers.map((p) => ({ ...p, disabled: p.id.startsWith('(failed)'), checked: !p.id.startsWith('(failed)') })),
  );

  const scenarioPickers = listScenarios().map((s) => ({ id: s.id, label: s.id, title: s.notes }));
  getCheckedScenarios = renderScenarioPicker(scenarioPickers.map((p) => ({ ...p, title: p.title ?? '' })));

  // Registration banner: report any family/engine that didn't wire up.
  const notes: string[] = [];
  for (const e of registration.engines) if (!e.ok) notes.push(`engine ${e.id}: ${e.reason}`);
  for (const f of registration.scenarioFamilies)
    if (!f.ok) notes.push(`scenarios ${f.family}: ${f.reason}`);
  notes.push(`${registration.engineCount} engines, ${registration.scenarioCount} scenarios registered`);
  renderRegistrationBanner(notes);

  // 4. Wire controls.
  wireControls();

  // 5. Expose the launcher control surface.
  window.__SUITE__ = {
    run: runFromFilter,
    env,
    support,
    registration,
    referenceEngineId,
    engineIds: listEngines().map((e) => e.id),
    scenarioIds: listScenarios().map((s) => s.id),
    ready: true,
  };

  setRunStatus(`ready · ${registration.engineCount} engines · ${registration.scenarioCount} scenarios`);
}

function wireControls(): void {
  getEl<HTMLButtonElement>('run').addEventListener('click', () => {
    void runFromUi();
  });
  getEl<HTMLButtonElement>('select-all-eng').addEventListener('click', () => setAllChecked('engines-list', true));
  getEl<HTMLButtonElement>('select-all-scn').addEventListener('click', () => setAllChecked('scenarios-list', true));
  getEl<HTMLButtonElement>('download').addEventListener('click', downloadResults);
}

/** Resolve the browser tag: explicit selection wins, else the detected family. */
function resolveBrowser(explicit?: BrowserName | 'auto'): BrowserName {
  if (explicit && explicit !== 'auto') return explicit;
  const tag = getEl<HTMLSelectElement>('browser-tag').value;
  if (tag === 'chromium' || tag === 'webkit' || tag === 'firefox') return tag;
  return env.browser;
}

/** Run driven by the on-page controls. */
async function runFromUi(): Promise<ScenarioResult[]> {
  const engineIds = getCheckedEngines();
  const scenarioIds = getCheckedScenarios();
  const pillar = getEl<HTMLSelectElement>('pillar').value as RunOptions['pillar'];
  const warmup = Number(getEl<HTMLInputElement>('warmup').value) || 3;
  const iters = Number(getEl<HTMLInputElement>('iters').value) || 6;
  return runFromFilter({ engineIds, scenarioIds, pillar, warmup, iters });
}

/** Run driven by an explicit filter (the headless launcher path + the UI path funnel here). */
async function runFromFilter(filter: SuiteRunFilter = {}): Promise<ScenarioResult[]> {
  const runBtn = getEl<HTMLButtonElement>('run');
  const dlBtn = getEl<HTMLButtonElement>('download');
  runBtn.disabled = true;
  dlBtn.disabled = true;
  window.__RUN_DONE__ = false;
  window.__RESULTS__ = undefined;

  const browser = resolveBrowser(filter.browser);
  const engineIds = filter.engineIds && filter.engineIds.length ? filter.engineIds : undefined;
  const scenarioIds = filter.scenarioIds && filter.scenarioIds.length ? filter.scenarioIds : undefined;

  // Resolve the matrix layout we will draw (so empty selections still produce a sensible grid).
  const drawEngines = engineIds ?? listEngines().map((e) => e.id);
  const drawScenarios = scenarioIds ?? listScenarios().map((s) => s.id);
  matrix.start(drawEngines, drawScenarios);
  setRunStatus(`running on ${browser}…`);

  const opts: RunOptions = {
    browser,
    pillar: filter.pillar ?? 'all',
    benchOptions: { warmup: filter.warmup ?? 3, iters: filter.iters ?? 6 },
    onResult: (r) => matrix.update(r),
    onProgress: (done, total, label) => setProgress(done, total, label),
  };
  if (engineIds) opts.engineIds = engineIds;
  if (scenarioIds) opts.scenarioIds = scenarioIds;

  let results: ScenarioResult[] = [];
  try {
    results = await runMatrix(opts);
    setRunStatus(`done · ${summarize(results)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setRunStatus(`run failed: ${msg}`);
    window.__SUITE_ERROR__ = msg;
  } finally {
    hideProgress();
    runBtn.disabled = false;
    // Stash results for the launcher (window.__RESULTS__) regardless of partial failure.
    window.__RESULTS__ = results;
    window.__RUN_DONE__ = true;
    dlBtn.disabled = results.length === 0;
  }
  return results;
}

function summarize(results: ScenarioResult[]): string {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
}

/** Download the gathered results as a JSON file (the same shape the launcher collects). */
function downloadResults(): void {
  const results = window.__RESULTS__ ?? matrix.getResults();
  const payload = {
    schema: 'media-browser-test/results@1',
    generatedAtIso: new Date().toISOString(),
    env,
    support,
    referenceEngineId: getReferenceEngineId(),
    results,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `results-${env.browser}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Boot, surfacing any fatal error to both the page and the launcher.
boot().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  window.__SUITE_ERROR__ = msg;
  try {
    setRunStatus(`boot failed: ${msg}`);
  } catch {
    /* DOM may not be ready */
  }
  // eslint-disable-next-line no-console
  console.error('suite boot failed', err);
});
