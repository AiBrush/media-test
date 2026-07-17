/** Browser application orchestration and the launcher control surface. */

import { detectEnv, detectCodecSupport } from '../core/feature-detect.ts';
import type { EnvInfo, CodecSupport } from '../core/feature-detect.ts';
import type { BrowserName, Operation } from '../core/engine.ts';
import { stablePrettyJson, canonicalContentHash } from '../core/report.ts';
import { listScenarios, listScoredEngines, getEngine } from '../core/registry.ts';
import { buildExecutionOrder, runMatrix } from '../core/runner.ts';
import type { RunOptions } from '../core/runner.ts';
import { groupScenariosByFeature } from '../core/scenario.ts';
import type { Scenario, ScenarioFamily, ScenarioResult } from '../core/scenario.ts';
import { installFrameBakeControl } from '../core/frame-bake.ts';
import {
  createResultCache,
  unavailableCacheSnapshot,
} from './result-cache.ts';
import type { ResultCache } from './result-cache.ts';
import { registerAll } from './register.ts';
import type { RegistrationReport } from './register.ts';
import {
  freezeRunConfiguration,
  RUN_OPTION_DEFINITIONS,
  RunOptionValidationError,
} from './options.ts';
import type { FrozenRunConfiguration, SuiteRunFilter } from './options.ts';
import {
  buildAppReportArtifacts,
  createCanonicalRunArtifact,
  createRunManifest,
  finalizeRunManifest,
} from './run-artifact.ts';
import type {
  CacheManifestSnapshot,
  CanonicalRunArtifact,
  RunCompletionState,
  RunManifest,
} from './run-artifact.ts';
import {
  activeRunWorkText,
  appendBrowserRunEvidence,
  announceStatus,
  beginBrowserRunEvidence,
  cancellationPresentation,
  failBrowserRunEvidence,
  focusRunControl,
  getEl,
  hideFileProgress,
  hideProgress,
  MatrixView,
  renderCacheStatus,
  renderEnginePicker,
  renderEnv,
  renderFeaturePicker,
  renderIntersectionCount,
  renderOperationPicker,
  renderRegistrationBanner,
  renderRunManifest,
  renderScenarioPicker,
  reconcileBrowserRunEvidence,
  runContinuationAction,
  setAllChecked,
  setConfigurationControlsDisabled,
  setCurrentWork,
  setFileProgress,
  setProgress,
  setRunState,
  setRunStatus,
} from './ui.ts';
import type { ActiveRunWork, BrowserRunEvidence, CancellationBoundary, ResultFilter } from './ui.ts';
import {
  buildScenarioPickerItems,
  loadScenarioDisplayManifest,
} from './scenario-display.ts';

const SUITE_VERSION = '0.1.0';
const BUILD_REVISION = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_BUILD_REVISION)
  ?? 'development';

interface SuiteControl {
  run(filter?: SuiteRunFilter): Promise<ScenarioResult[]>;
  snapshot(completionState?: RunCompletionState, partialReason?: string): Promise<CanonicalRunArtifact | undefined>;
  importCache(value: unknown, sourceLabel?: string): Promise<number>;
  env: EnvInfo;
  support: CodecSupport;
  registration: RegistrationReport;
  engineIds: string[];
  featureIds: ScenarioFamily[];
  scenarioIds: string[];
  optionSchema: typeof RUN_OPTION_DEFINITIONS;
  ready: true;
}

declare global {
  interface Window {
    __SUITE__?: SuiteControl;
    __RESULTS__?: ScenarioResult[];
    __RUN_ARTIFACT__?: CanonicalRunArtifact;
    __RUN_HISTORY__?: CanonicalRunArtifact[];
    __RUN_DONE__?: boolean;
    __SUITE_ERROR__?: string;
  }
}

interface ActiveRun {
  controller: AbortController;
  configuration: FrozenRunConfiguration;
  baseManifest: RunManifest;
  evidence: BrowserRunEvidence;
  work: ActiveRunWork;
  timeoutId: number;
  stopReason?: string;
  state: 'running' | 'stopping';
}

let env: EnvInfo;
let support: CodecSupport;
let registration: RegistrationReport;
let getCheckedEngines: () => string[] = () => [];
let getCheckedFeatures: () => string[] = () => [];
let getCheckedScenarios: () => string[] = () => [];
let getCheckedOperations: () => string[] = () => [];
const matrix = new MatrixView('results');
let activeRun: ActiveRun | undefined;
let currentArtifact: CanonicalRunArtifact | undefined;
let currentManifest: RunManifest | undefined;
let lastCacheWarning: string | undefined;
const resultCache: ResultCache | undefined = createResultCache({
  scenarioIdentity,
  onWarning: (message) => {
    lastCacheWarning = message;
    try {
      setRunStatus(message);
      void refreshCacheStatus();
    } catch {
      // Boot may not have reached the DOM yet; the warning remains in the next cache snapshot.
    }
  },
});

async function boot(): Promise<void> {
  [env, support] = await Promise.all([detectEnv(), detectCodecSupport()]);
  renderEnv(env, support);
  registration = await registerAll();

  const enginePickers = listScoredEngines().map((engine) => ({ id: engine.id, label: engine.id }));
  for (const entry of registration.engines) {
    if (!entry.ok) enginePickers.push({
      id: `(failed) ${entry.id}`,
      label: `${entry.id} — failed: ${entry.reason ?? 'unknown'}`,
    });
  }
  getCheckedEngines = renderEnginePicker(enginePickers.map((item) => ({
    ...item,
    disabled: item.id.startsWith('(failed)'),
    checked: !item.id.startsWith('(failed)'),
  })));

  const scenarioGroups = groupScenariosByFeature(listScenarios());
  getCheckedFeatures = renderFeaturePicker(scenarioGroups.map((group) => ({
    id: group.id,
    label: group.label,
    count: group.scenarios.length,
    title: `${group.scenarios.length} ${group.label.toLowerCase()} scenario(s)`,
    checked: true,
  })));
  const allScenarios = scenarioGroups.flatMap((group) => group.scenarios);
  const scenarioDisplayManifest = await loadScenarioDisplayManifest();
  getCheckedScenarios = renderScenarioPicker(buildScenarioPickerItems(allScenarios, scenarioDisplayManifest));
  const operations = [...new Set(allScenarios.map((scenario) => scenario.op))].sort() as Operation[];
  getCheckedOperations = renderOperationPicker(operations);

  const notes: string[] = [];
  for (const entry of registration.engines) if (!entry.ok) notes.push(`engine ${entry.id}: ${entry.reason}`);
  for (const entry of registration.scenarioFamilies) if (!entry.ok) notes.push(`scenarios ${entry.family}: ${entry.reason}`);
  notes.push(`${listScoredEngines().length} scored engines; platform is one unscored instrument; ${registration.scenarioCount} scenarios registered`);
  renderRegistrationBanner(notes);
  ensureSeed();
  wireControls();
  updateIntersectionCount();
  renderRunManifest(undefined);
  await refreshCacheStatus();
  installFrameBakeControl();

  window.__SUITE__ = {
    run: runFromFilter,
    snapshot: snapshotRun,
    importCache: importCacheBundle,
    env,
    support,
    registration,
    engineIds: listScoredEngines().map((engine) => engine.id),
    featureIds: scenarioGroups.map((group) => group.id),
    scenarioIds: listScenarios().map((scenario) => scenario.id),
    optionSchema: RUN_OPTION_DEFINITIONS,
    ready: true,
  };
  setRunState('idle');
  setRunStatus(`idle · ${listScoredEngines().length} scored engines · ${registration.scenarioCount} scenarios`);
  if (shouldAutoStart()) window.setTimeout(() => { void runFromUi(); }, 0);
}

function wireControls(): void {
  getEl<HTMLButtonElement>('run').addEventListener('click', () => {
    if (activeRun) {
      if (activeRun.state === 'running') stopActiveRun('Stop requested by the operator.');
      return;
    }
    void runFromUi();
  });
  const groupActions: Array<[string, string, boolean]> = [
    ['select-all-features', 'features-list', true], ['clear-features', 'features-list', false],
    ['select-all-eng', 'engines-list', true], ['clear-engines', 'engines-list', false],
    ['select-all-scn', 'scenarios-list', true], ['clear-scenarios', 'scenarios-list', false],
    ['select-all-operations', 'operations-list', true], ['clear-operations', 'operations-list', false],
  ];
  for (const [buttonId, listId, checked] of groupActions) {
    getEl<HTMLButtonElement>(buttonId).addEventListener('click', () => setAllChecked(listId, checked));
  }
  for (const id of ['features-list', 'operations-list', 'scenarios-list']) {
    getEl(id).addEventListener('change', updateIntersectionCount);
  }
  getEl<HTMLButtonElement>('copy-seed').addEventListener('click', () => { void copySeed(); });
  getEl<HTMLSelectElement>('result-status-filter').addEventListener('change', (event) => {
    matrix.setResultFilter((event.currentTarget as HTMLSelectElement).value as ResultFilter);
  });
  getEl<HTMLButtonElement>('download').addEventListener('click', downloadRawResults);
  getEl<HTMLButtonElement>('download-report-json').addEventListener('click', downloadReportJson);
  getEl<HTMLButtonElement>('download-report-md').addEventListener('click', downloadReportMarkdown);
  getEl<HTMLButtonElement>('export-cache').addEventListener('click', () => { void downloadCachedResults(); });
  getEl<HTMLButtonElement>('clear-cache').addEventListener('click', () => { void clearCachedResults(); });
  getEl<HTMLButtonElement>('clear-aibrush-cache').addEventListener('click', () => { void clearCachedResults('aibrush-media'); });
  const importFile = getEl<HTMLInputElement>('import-cache-file');
  importFile.addEventListener('change', () => {
    getEl<HTMLButtonElement>('import-cache').disabled = !resultCache || !importFile.files?.[0] || activeRun !== undefined;
  });
  getEl<HTMLButtonElement>('import-cache').addEventListener('click', () => { void importSelectedCacheFile(); });
  setCacheControlsDisabled(false);
}

function shouldAutoStart(): boolean {
  const autorun = new URLSearchParams(window.location.search).get('autorun');
  return autorun === '1' || autorun === 'true';
}

function ensureSeed(): string {
  const input = getEl<HTMLInputElement>('random-seed');
  if (!input.value.trim()) input.value = createSeed();
  return input.value.trim();
}

function createSeed(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function copySeed(): Promise<void> {
  const seed = ensureSeed();
  try {
    await navigator.clipboard.writeText(seed);
    setRunStatus('Replay seed copied.');
  } catch {
    getEl<HTMLInputElement>('random-seed').select();
    setRunStatus('Clipboard unavailable; replay seed selected for copying.');
  }
}

function updateIntersectionCount(): void {
  const features = new Set(getCheckedFeatures());
  const operations = new Set(getCheckedOperations());
  const selected = new Set(getCheckedScenarios());
  const matching = listScenarios().filter((scenario) =>
    selected.has(scenario.id) && features.has(scenario.family) && operations.has(scenario.op)).length;
  renderIntersectionCount(matching, listScenarios().length);
}

async function runFromUi(): Promise<ScenarioResult[]> {
  const browserTag = getEl<HTMLSelectElement>('browser-tag').value as BrowserName | 'auto';
  return runFromFilter({
    engineIds: getCheckedEngines(),
    featureIds: getCheckedFeatures() as ScenarioFamily[],
    scenarioIds: getCheckedScenarios(),
    operations: getCheckedOperations() as Operation[],
    pillar: getEl<HTMLSelectElement>('pillar').value as NonNullable<RunOptions['pillar']>,
    browser: resolveBrowser(browserTag),
    browserTag,
    warmup: getEl<HTMLInputElement>('warmup').valueAsNumber,
    iters: getEl<HTMLInputElement>('iters').valueAsNumber,
    timeoutMs: getEl<HTMLInputElement>('timeout-ms').valueAsNumber,
    reuseData: getEl<HTMLInputElement>('reuse-data').checked,
    randomizeOrder: getEl<HTMLInputElement>('randomize-order').checked,
    randomSeed: ensureSeed(),
    exhaustiveMedia: getEl<HTMLInputElement>('exhaustive-media').checked,
  });
}

async function runFromFilter(filter: SuiteRunFilter = {}): Promise<ScenarioResult[]> {
  if (activeRun) {
    if (activeRun.state === 'running') stopActiveRun('A second run request asked the active run to stop.');
    return [...activeRun.evidence.results];
  }
  clearValidationState();
  setRunState('validating');
  setRunStatus('Validating the selected run configuration.');
  delete window.__SUITE_ERROR__;
  window.__RUN_DONE__ = false;

  let configuration: FrozenRunConfiguration;
  let selectedScenarios: Scenario[];
  try {
    const resolvedBrowser = filter.browser ?? env.browser;
    const scoredEngineIds = listScoredEngines().map((engine) => engine.id);
    const requestedEngineIds = filter.engineIds === undefined
      ? scoredEngineIds
      : scoredEngineIds.filter((engineId) => filter.engineIds!.includes(engineId));
    if (filter.engineIds !== undefined && requestedEngineIds.length !== filter.engineIds.length) {
      const unknown = filter.engineIds.filter((engineId) => !scoredEngineIds.includes(engineId));
      throw new RunOptionValidationError(
        'engines',
        `Unknown or unscored engine selection: ${unknown.join(', ') || 'empty selection'}.`,
        'engines-fs',
      );
    }
    const availableScenarios = listScenarios();
    const scenarioIds = new Set(availableScenarios.map((scenario) => scenario.id));
    const featureIds = new Set(availableScenarios.map((scenario) => scenario.family));
    const operations = new Set(availableScenarios.map((scenario) => scenario.op));
    const unknownScenarios = (filter.scenarioIds ?? []).filter((id) => !scenarioIds.has(id));
    const unknownFeatures = (filter.featureIds ?? []).filter((id) => !featureIds.has(id));
    const unknownOperations = (filter.operations ?? []).filter((id) => !operations.has(id));
    if (unknownScenarios.length || unknownFeatures.length || unknownOperations.length) {
      throw new RunOptionValidationError(
        'scenarios',
        `Unknown selection: ${[
          ...unknownScenarios.map((id) => `scenario ${id}`),
          ...unknownFeatures.map((id) => `feature ${id}`),
          ...unknownOperations.map((id) => `operation ${id}`),
        ].join(', ')}.`,
        'scenarios-fs',
      );
    }
    const requestedScenarios = filter.scenarioIds === undefined
      ? listScenarios()
      : listScenarios().filter((scenario) => filter.scenarioIds!.includes(scenario.id));
    selectedScenarios = filterScenarios(requestedScenarios, filter);
    configuration = freezeRunConfiguration({
      ...filter,
      browser: resolvedBrowser,
      engineIds: requestedEngineIds,
      scenarioIds: selectedScenarios.map((scenario) => scenario.id),
    }, {
      browser: resolvedBrowser,
      browserTag: filter.browserTag ?? filter.browser ?? (getEl<HTMLSelectElement>('browser-tag').value as BrowserName | 'auto'),
      engineIds: listScoredEngines().map((engine) => engine.id),
      featureIds: [...new Set(listScenarios().map((scenario) => scenario.family))],
      scenarioIds: listScenarios().map((scenario) => scenario.id),
      operations: [...new Set(listScenarios().map((scenario) => scenario.op))],
      seedFactory: createSeed,
    });
  } catch (error) {
    handleValidationError(error);
    window.__RUN_DONE__ = true;
    return [];
  }

  const controller = new AbortController();
  const startedAtIso = new Date().toISOString();
  const drawEngines = await resolveEngineInstanceIds(configuration.engineIds);
  // The runner shuffles registry keys, then constructed adapters report their canonical instance
  // ids. Mirror that exact sequence here: shuffling the versioned ids directly can produce a
  // different order for the same seed (for example `mediabunny` vs `mediabunny@1.48.0`).
  const registryExecutionOrder = buildExecutionOrder(
    [...configuration.engineIds],
    configuration.scenarioIds as string[],
    configuration.randomizeOrder,
    configuration.randomSeed,
  );
  const instanceIdByRegistryId = new Map(configuration.engineIds.map((id, index) => [id, drawEngines[index] ?? id]));
  const executionOrder = registryExecutionOrder.map((cell) => ({
    ...cell,
    engineId: instanceIdByRegistryId.get(cell.engineId) ?? cell.engineId,
  }));
  const runId = `run-${canonicalContentHash({
    startedAtIso,
    seed: configuration.randomSeed,
    browser: configuration.browser,
    executionOrder,
  })}`;
  resultCache?.setRunContext(runId);
  const initialCache = await cacheSnapshot(!configuration.reuseData);
  const baseManifest = createRunManifest({
    runId,
    startedAtIso,
    completionState: 'running',
    suiteVersion: SUITE_VERSION,
    buildRevision: BUILD_REVISION,
    env,
    support,
    configuration,
    engineInstanceIds: drawEngines,
    scenarios: selectedScenarios,
    executionOrder,
    cache: initialCache,
    registration,
  });
  const firstCell = executionOrder[0];
  const timeoutId = window.setTimeout(() => {
    if (activeRun?.controller === controller && !controller.signal.aborted) {
      stopActiveRun(`Run timeout elapsed after ${configuration.timeoutMs} ms.`);
    }
  }, configuration.timeoutMs);
  activeRun = {
    controller,
    configuration,
    baseManifest,
    evidence: beginBrowserRunEvidence(),
    work: workForCell(firstCell, selectedScenarios),
    timeoutId,
    state: 'running',
  };
  currentManifest = baseManifest;
  if (currentArtifact) {
    window.__RUN_HISTORY__ ??= [];
    window.__RUN_HISTORY__.push(currentArtifact);
  }
  currentArtifact = undefined;
  window.__RUN_ARTIFACT__ = undefined;
  window.__RESULTS__ = [];
  renderRunManifest(baseManifest);
  matrix.start(drawEngines, configuration.scenarioIds as string[], { executionOrder });
  hideFileProgress();
  const initialProgressLabel = firstCell
    ? `${firstCell.scenarioId} / ${firstCell.engineId}`
    : 'no scheduled cells';
  setProgress(0, executionOrder.length, initialProgressLabel);
  setConfigurationControlsDisabled(true);
  setExportControlsDisabled(true);
  setCacheControlsDisabled(true);
  const runButton = getEl<HTMLButtonElement>('run');
  runButton.textContent = 'Stop run safely';
  setRunState('running');
  setRunStatus(`Run ${runId} started on ${configuration.browser}.`);
  setCurrentWork(activeRunWorkText(activeRun.work));

  const opts: RunOptions = {
    browser: configuration.browser,
    engineIds: [...configuration.engineIds],
    scenarioIds: [...configuration.scenarioIds],
    pillar: configuration.pillar,
    benchOptions: { warmup: configuration.warmup, iters: configuration.iters },
    randomizeOrder: configuration.randomizeOrder,
    randomSeed: configuration.randomSeed,
    exhaustiveMedia: configuration.exhaustiveMedia,
    signal: controller.signal,
    onResult: (result) => {
      if (!activeRun || activeRun.controller !== controller) return;
      activeRun.evidence = appendBrowserRunEvidence(activeRun.evidence, result);
      matrix.update(result);
      window.__RESULTS__ = [...activeRun.evidence.results];
    },
    onProgress: (done, total, label) => {
      if (!activeRun || activeRun.controller !== controller) return;
      hideFileProgress();
      setProgress(done, total, label);
      const next = activeRun.state === 'stopping' ? undefined : executionOrder[done];
      activeRun.work = {
        ...workForCell(next, selectedScenarios),
        lastCompletedCell: label,
      };
      if (activeRun.state === 'stopping') {
        const presentation = cancellationPresentation(activeRun.work);
        runButton.textContent = presentation.buttonLabel;
        setCurrentWork(presentation.currentWork);
      } else {
        setCurrentWork(activeRunWorkText(activeRun.work));
      }
    },
    onFileProgress: (completed, total, label) => {
      if (!activeRun || activeRun.controller !== controller) return;
      setFileProgress(completed, total, label);
      activeRun.work = {
        ...activeRun.work,
        currentFile: { label, completed, total },
      };
      if (activeRun.state === 'stopping') {
        const presentation = cancellationPresentation(activeRun.work);
        runButton.textContent = presentation.buttonLabel;
        setCurrentWork(presentation.currentWork);
      } else {
        setCurrentWork(activeRunWorkText(activeRun.work));
      }
    },
  };
  if (configuration.featureIds.length > 0) opts.featureIds = [...configuration.featureIds];
  if (configuration.operations.length > 0) opts.operations = [...configuration.operations];
  if (configuration.reuseData && resultCache) opts.resultReuse = resultCache;

  let terminalState: RunCompletionState = 'completed';
  let partialReason: string | undefined;
  try {
    const returned = await runMatrix(opts);
    if (activeRun?.controller === controller) {
      activeRun.evidence = reconcileBrowserRunEvidence(activeRun.evidence, returned);
      window.__RESULTS__ = [...activeRun.evidence.results];
    }
    if (controller.signal.aborted) {
      terminalState = 'completed-partial';
      partialReason = activeRun?.stopReason ?? 'Run stopped at a cooperative cell boundary.';
    }
  } catch (error) {
    terminalState = 'failed';
    partialReason = error instanceof Error ? error.message : String(error);
    if (activeRun?.controller === controller) {
      activeRun.evidence = failBrowserRunEvidence(activeRun.evidence, partialReason);
    }
    window.__SUITE_ERROR__ = partialReason;
  } finally {
    const run = activeRun?.controller === controller ? activeRun : undefined;
    window.clearTimeout(timeoutId);
    const streamed = [...(run?.evidence.results ?? window.__RESULTS__ ?? [])];
    const endedAtIso = new Date().toISOString();
    const cache = await cacheSnapshot(!configuration.reuseData);
    currentManifest = finalizeRunManifest(baseManifest, streamed, terminalState, endedAtIso, cache, partialReason);
    try {
      currentArtifact = createCanonicalRunArtifact({
        manifest: currentManifest,
        registration,
        env,
        support,
        results: streamed,
        scenarioIdentity: scenarioIdentity,
      });
      window.__RUN_ARTIFACT__ = currentArtifact;
      window.__RESULTS__ = currentArtifact.results;
    } catch (error) {
      terminalState = 'failed';
      const validationFailure = error instanceof Error ? error.message : String(error);
      partialReason = `result writer validation failed: ${validationFailure}`;
      window.__SUITE_ERROR__ = partialReason;
      currentManifest = finalizeRunManifest(baseManifest, streamed, terminalState, endedAtIso, cache, partialReason);
      currentArtifact = undefined;
      window.__RUN_ARTIFACT__ = undefined;
      setRunStatus(window.__SUITE_ERROR__);
    }
    renderRunManifest(currentManifest);
    renderCacheStatus(cache);
    hideProgress();
    matrix.finish();
    activeRun = undefined;
    resultCache?.setRunContext(undefined);
    setConfigurationControlsDisabled(false);
    setCacheControlsDisabled(false);
    setExportControlsDisabled(currentArtifact === undefined);
    window.__RUN_DONE__ = true;
    setRunState(terminalState);
    runButton.textContent = terminalState === 'completed'
      ? 'Run selected features'
      : runContinuationAction(undefined).label;
    const summary = summarize(currentArtifact?.results ?? streamed);
    if (currentArtifact) {
      setRunStatus(terminalState === 'completed'
        ? `Completed · ${summary}`
        : `${terminalState}: ${partialReason ?? 'partial snapshot'} · ${summary}`);
    }
    setCurrentWork(`Last completed run: ${currentManifest.runId}; ${currentManifest.observedCellCount} of ${currentManifest.expectedCellCount} cells observed.`);
    focusRunControl();
  }
  return currentArtifact?.results ?? [...(window.__RESULTS__ ?? [])];
}

function filterScenarios(candidates: readonly Scenario[], filter: SuiteRunFilter): Scenario[] {
  const featureSet = filter.featureIds === undefined ? undefined : new Set(filter.featureIds);
  const operationSet = filter.operations === undefined ? undefined : new Set(filter.operations);
  const pillar = filter.pillar ?? 'all';
  return candidates.filter((scenario) =>
    (!featureSet || featureSet.has(scenario.family)) &&
    (!operationSet || operationSet.has(scenario.op)) &&
    scenarioMatchesPillar(scenario, pillar));
}

function scenarioMatchesPillar(scenario: Scenario, pillar: NonNullable<RunOptions['pillar']>): boolean {
  const robustness = scenario.family === 'robustness' || typeof scenario.mutate === 'function' || scenario.oracles.includes('graceful-failure');
  if (pillar === 'all') return true;
  if (pillar === 'robustness') return robustness;
  return !robustness;
}

function workForCell(
  cell: { engineId: string; scenarioId: string } | undefined,
  scenarios: readonly Scenario[],
): ActiveRunWork {
  const scenario = cell ? scenarios.find((candidate) => candidate.id === cell.scenarioId) : undefined;
  return {
    ...(cell ? { currentCell: `${cell.scenarioId} / ${cell.engineId}` } : {}),
    cancellationBoundary: cancellationBoundaryForScenario(scenario),
  };
}

function cancellationBoundaryForScenario(scenario: Scenario | undefined): CancellationBoundary {
  const terminableWorker = scenario !== undefined && (
    scenario.family === 'robustness' ||
    typeof scenario.mutate === 'function' ||
    scenario.oracles.includes('graceful-failure')
  );
  return terminableWorker ? 'terminable-worker' : 'safe-boundary-only';
}

async function resolveEngineInstanceIds(registrationIds: readonly string[]): Promise<string[]> {
  return await Promise.all(registrationIds.map(async (id) => {
    const registered = getEngine(id);
    if (!registered) return id;
    try {
      return (await registered.factory()).id || id;
    } catch {
      return id;
    }
  }));
}

function resolveBrowser(tag: BrowserName | 'auto'): BrowserName {
  return tag === 'auto' ? env.browser : tag;
}

function stopActiveRun(reason: string): void {
  const run = activeRun;
  if (!run || run.controller.signal.aborted) return;
  run.state = 'stopping';
  run.stopReason = reason;
  run.controller.abort(new DOMException(reason, 'AbortError'));
  setRunState('stopping');
  const presentation = cancellationPresentation(run.work);
  getEl<HTMLButtonElement>('run').textContent = presentation.buttonLabel;
  setRunStatus(presentation.status);
  setCurrentWork(presentation.currentWork);
}

function handleValidationError(error: unknown): void {
  const validation = error instanceof RunOptionValidationError
    ? error
    : new RunOptionValidationError('scenarios', error instanceof Error ? error.message : String(error), 'scenarios-fs');
  const fieldset = getEl<HTMLFieldSetElement>(validation.fieldsetId);
  fieldset.setAttribute('aria-invalid', 'true');
  getEl('validation-message').textContent = validation.message;
  setRunState('idle');
  setRunStatus(validation.message);
}

function clearValidationState(): void {
  for (const id of ['engines-fs', 'scenarios-fs', 'features-fs', 'operations-fs', 'options-fs']) {
    getEl(id).removeAttribute('aria-invalid');
  }
  getEl('validation-message').textContent = '';
}

async function snapshotRun(
  completionState?: RunCompletionState,
  partialReason?: string,
): Promise<CanonicalRunArtifact | undefined> {
  if (!activeRun) return currentArtifact;
  const state = completionState ?? activeRun.state;
  const cache = await cacheSnapshot(!activeRun.configuration.reuseData);
  const manifest = finalizeRunManifest(
    activeRun.baseManifest,
    activeRun.evidence.results,
    state,
    new Date().toISOString(),
    cache,
    state === 'completed' ? undefined : partialReason ?? activeRun.stopReason ?? 'Run snapshot before completion.',
  );
  return createCanonicalRunArtifact({
    manifest,
    registration,
    env,
    support,
    results: activeRun.evidence.results,
    scenarioIdentity,
  });
}

function scenarioIdentity(scenarioId: string): { revision: number; definitionHash: string } | undefined {
  const scenario = listScenarios().find((candidate) => candidate.id === scenarioId);
  if (!scenario) return undefined;
  return { revision: scenario.revision, definitionHash: scenario.definitionHash };
}

async function cacheSnapshot(forcedFresh: boolean): Promise<CacheManifestSnapshot> {
  if (!resultCache) return unavailableCacheSnapshot(lastCacheWarning);
  const snapshot = await resultCache.snapshot(forcedFresh);
  return lastCacheWarning && !snapshot.lastError ? { ...snapshot, available: false, lastError: lastCacheWarning } : snapshot;
}

async function refreshCacheStatus(): Promise<void> {
  renderCacheStatus(await cacheSnapshot(false));
}

function setCacheControlsDisabled(disabled: boolean): void {
  for (const id of ['export-cache', 'clear-cache', 'clear-aibrush-cache']) {
    getEl<HTMLButtonElement>(id).disabled = disabled || !resultCache;
  }
  const file = getEl<HTMLInputElement>('import-cache-file');
  file.disabled = disabled || !resultCache;
  getEl<HTMLButtonElement>('import-cache').disabled = disabled || !resultCache || !file.files?.[0];
}

function setExportControlsDisabled(disabled: boolean): void {
  for (const id of ['download', 'download-report-json', 'download-report-md']) {
    getEl<HTMLButtonElement>(id).disabled = disabled;
  }
}

function downloadRawResults(): void {
  if (!currentArtifact) return;
  try {
    downloadText(stablePrettyJson(currentArtifact), `raw-results-${currentArtifact.runId}.json`, 'application/json');
    setRunStatus(`Raw results@2 artifact export started for ${currentArtifact.runId}.`);
  } catch (error) {
    setRunStatus(`Raw export failed; in-memory run retained: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function downloadReportJson(): void {
  if (!currentArtifact) return;
  try {
    const report = buildAppReportArtifacts(currentArtifact);
    downloadText(report.jsonText, `report-${currentArtifact.runId}.json`, 'application/json');
    setRunStatus(`Structured report JSON export started for ${currentArtifact.runId}.`);
  } catch (error) {
    setRunStatus(`Report export failed; in-memory run retained: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function downloadReportMarkdown(): void {
  if (!currentArtifact) return;
  try {
    const report = buildAppReportArtifacts(currentArtifact);
    downloadText(report.markdown, `report-${currentArtifact.runId}.md`, 'text/markdown');
    setRunStatus(`Report Markdown export started for ${currentArtifact.runId}.`);
  } catch (error) {
    setRunStatus(`Report export failed; in-memory run retained: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function downloadCachedResults(): Promise<void> {
  if (!resultCache) {
    setRunStatus('Cache unavailable: IndexedDB is not available.');
    return;
  }
  try {
    const bundle = await resultCache.exportBundle();
    downloadText(stablePrettyJson(bundle), `cache-${env.browser}-${Date.now()}.json`, 'application/json');
    setRunStatus(`Validated cache bundle export started with ${bundle.entries.length} entries.`);
  } catch (error) {
    setRunStatus(`Cache export failed without changing live verdicts: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function clearCachedResults(engineId?: string): Promise<void> {
  if (!resultCache || activeRun) return;
  const description = engineId ? `${engineId} cached results` : 'all cached results for this origin';
  if (!window.confirm(`Clear ${description}? This cannot be undone.`)) {
    announceStatus('Cache clear cancelled.');
    return;
  }
  setCacheControlsDisabled(true);
  try {
    const count = engineId ? await resultCache.clearEngine(engineId) : await resultCache.clear();
    setRunStatus(`Cleared ${count} cached result${count === 1 ? '' : 's'} from ${location.origin}.`);
  } catch (error) {
    setRunStatus(`Cache clear failed without changing live verdicts: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setCacheControlsDisabled(false);
    await refreshCacheStatus();
    focusRunControl();
  }
}

async function importSelectedCacheFile(): Promise<void> {
  const file = getEl<HTMLInputElement>('import-cache-file').files?.[0];
  if (!file) return;
  try {
    const imported = await importCacheBundle(JSON.parse(await file.text()), file.name);
    setRunStatus(`Imported ${imported} validated cache entries into origin ${location.origin}.`);
  } catch (error) {
    setRunStatus(`Cache import rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function importCacheBundle(value: unknown, sourceLabel?: string): Promise<number> {
  if (!resultCache) throw new Error('IndexedDB is not available');
  if (activeRun) throw new Error('stop the current run before importing cache data');
  const count = await resultCache.importBundle(value, sourceLabel);
  await refreshCacheStatus();
  return count;
}

function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function summarize(results: readonly ScenarioResult[]): string {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const label = result.coverage?.grade === 'partial' ? 'Partial' : result.status;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts).map(([label, count]) => `${label}:${count}`).join(' ') || 'no cells observed';
}

boot().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  window.__SUITE_ERROR__ = message;
  window.__RUN_DONE__ = true;
  try {
    setRunState('failed');
    setRunStatus(`Boot failed: ${message}`);
  } catch {
    // The document may itself be incomplete.
  }
  console.error('suite boot failed', error);
});
