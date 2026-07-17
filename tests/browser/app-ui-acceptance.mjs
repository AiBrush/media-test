#!/usr/bin/env bun

/**
 * Browser-facing acceptance for REQ-UI-03/04/08/09/10/11/12/13/15/17/18/19.
 *
 * This deliberately is not named `*.test.*`/`*.spec.*`: Bun's unit-test discovery must not start
 * browsers as a side effect. Run it explicitly with:
 *
 *   bun tests/browser/app-ui-acceptance.mjs
 *
 * The runner starts two isolated loopback Vite origins, drives the real application in Chromium,
 * and shuts down every process even when an assertion fails.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { RAW_RUN_SCHEMA_ID } from '../../src/core/report.ts';

const ROOT = resolve(import.meta.dir, '../..');
const checks = [];

async function check(name, task) {
  const started = performance.now();
  await task();
  const elapsed = performance.now() - started;
  checks.push({ name, elapsed });
  console.log(`ok ${checks.length} - ${name} (${elapsed.toFixed(0)} ms)`);
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function startVite(port) {
  const child = Bun.spawn([
    'bunx', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: ROOT,
    stdout: 'ignore',
    stderr: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(50).then(() => false),
    ])) {
      throw new Error(`Vite exited before ${url} became ready`);
    }
    try {
      const response = await fetch(`${url}/index.html`);
      if (response.ok) return { child, url };
    } catch {
      // The listener is not ready yet.
    }
    await Bun.sleep(50);
  }
  child.kill();
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopVite(server) {
  if (!server) return;
  server.child.kill('SIGTERM');
  await Promise.race([server.child.exited, Bun.sleep(2_000)]);
  if (server.child.exitCode === null) server.child.kill('SIGKILL');
}

async function openSuite(context, url) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${url}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SUITE__?.ready === true, undefined, { timeout: 30_000 });
  assert.deepEqual(pageErrors, [], `page boot errors: ${pageErrors.join('; ')}`);
  return page;
}

async function keyboardActivate(page, selector, key = 'Space') {
  const locator = page.locator(selector);
  await locator.focus();
  assert.equal(await locator.evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press(key);
}

async function downloadWithKeyboard(page, selector) {
  const pending = page.waitForEvent('download', { timeout: 5_000 });
  await keyboardActivate(page, selector, 'Enter');
  let download;
  try {
    download = await pending;
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      active: document.activeElement?.id,
      runStatus: document.getElementById('run-status')?.textContent,
      liveStatus: document.getElementById('live-status')?.textContent,
    }));
    throw new Error(`download ${selector} did not start: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
  const path = await download.path();
  assert(path, `download ${selector} did not produce a readable path`);
  return await readFile(path, 'utf8');
}

function runFilter(selection, seed = 'browser-acceptance-seed') {
  return {
    browser: 'chromium',
    browserTag: 'chromium',
    engineIds: [selection.engineId],
    featureIds: [selection.family],
    scenarioIds: [selection.id],
    operations: [selection.operation],
    pillar: 'functional',
    warmup: 0,
    iters: 1,
    timeoutMs: 30_000,
    reuseData: true,
    randomizeOrder: false,
    randomSeed: seed,
    exhaustiveMedia: false,
  };
}

let firstServer;
let secondServer;
let browser;

try {
  const firstPort = await freePort();
  let secondPort = await freePort();
  while (secondPort === firstPort) secondPort = await freePort();
  [firstServer, secondServer] = await Promise.all([
    startVite(firstPort),
    startVite(secondPort),
  ]);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  // This acceptance runs against an immutable page snapshot. Other concurrent repository work may
  // touch source files, so prevent Vite's development HMR client from navigating the page midway
  // through the 10,002-cell stress loop.
  await context.route(/\/\@vite\/client(?:\?.*)?$/, (route) => route.abort());

  const idlePage = await openSuite(context, firstServer.url);

  await check('REQ-UI-04 boots idle and rejects empty engine/scenario selections accessibly', async () => {
    assert.equal(await idlePage.locator('body').getAttribute('data-run-state'), 'idle');
    assert.match(await idlePage.locator('#run-status').innerText(), /^idle\b/i);
    assert.equal(await idlePage.locator('#results table').count(), 0);
    assert.equal(await idlePage.evaluate(() => window.__RESULTS__?.length ?? 0), 0);
    assert.equal(await idlePage.evaluate(() => window.__RUN_DONE__), undefined);

    await keyboardActivate(idlePage, '#clear-engines');
    await keyboardActivate(idlePage, '#run');
    await idlePage.waitForFunction(() => window.__RUN_DONE__ === true);
    assert.equal(await idlePage.locator('#engines-fs').getAttribute('aria-invalid'), 'true');
    assert.match(await idlePage.locator('#validation-message').innerText(), /engine/i);
    assert.equal(await idlePage.evaluate(() => window.__RESULTS__?.length ?? 0), 0);
    assert.equal(await idlePage.locator('#results table').count(), 0);

    await keyboardActivate(idlePage, '#select-all-eng');
    await keyboardActivate(idlePage, '#clear-scenarios');
    await keyboardActivate(idlePage, '#run');
    await idlePage.waitForFunction(() => window.__RUN_DONE__ === true);
    assert.equal(await idlePage.locator('#scenarios-fs').getAttribute('aria-invalid'), 'true');
    assert.match(await idlePage.locator('#validation-message').innerText(), /scenario/i);
    assert.equal(await idlePage.evaluate(() => window.__RESULTS__?.length ?? 0), 0);
  });

  await check('REQ-UI-10 exposes native named progress and bounded polite announcements', async () => {
    const progress = idlePage.getByLabel('Run progress');
    assert.equal(await progress.evaluate((node) => node.tagName), 'PROGRESS');
    const evidence = await idlePage.evaluate(async () => {
      const live = document.getElementById('live-status');
      if (!live) throw new Error('missing live status region');
      const announcements = [];
      const observer = new MutationObserver(() => {
        const text = live.textContent?.trim();
        if (text) announcements.push(text);
      });
      observer.observe(live, { childList: true, subtree: true, characterData: true });
      const ui = await import('/src/app/ui.ts');
      for (let done = 0; done <= 100; done++) {
        ui.setProgress(done, 100, `cell ${done}`);
        await Promise.resolve();
      }
      observer.disconnect();
      const node = document.getElementById('run-progress');
      if (!(node instanceof HTMLProgressElement)) throw new Error('run progress is not native');
      return {
        announcements,
        min: Number(node.getAttribute('min') ?? 0),
        max: node.max,
        value: node.value,
        valueText: node.getAttribute('aria-valuetext'),
        liveRole: live.getAttribute('role'),
        liveMode: live.getAttribute('aria-live'),
      };
    });
    assert.deepEqual({ min: evidence.min, max: evidence.max, value: evidence.value }, { min: 0, max: 100, value: 100 });
    assert.equal(evidence.valueText, '100 of 100; cell 100');
    assert.equal(evidence.liveRole, 'status');
    assert.equal(evidence.liveMode, 'polite');
    assert(evidence.announcements.length <= 12, `announcement flood: ${evidence.announcements.length}`);
    assert.equal(new Set(evidence.announcements).size, evidence.announcements.length, 'duplicate progress announcement');
    assert(evidence.announcements.includes('100 of 100 completed.'));
    const aria = await progress.ariaSnapshot();
    const cdp = await context.newCDPSession(idlePage);
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#run-progress' });
    const ax = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: true });
    await cdp.detach();
    const progressNode = ax.nodes.find((node) => node.role?.value === 'progressbar');
    assert(progressNode, `no progressbar in accessibility tree: ${aria}`);
    assert.equal(progressNode.name?.value, 'Run progress');
    assert.equal(progressNode.value?.value, 100);
    const properties = Object.fromEntries(progressNode.properties.map((property) => [property.name, property.value.value]));
    assert.deepEqual({
      min: properties.valuemin,
      max: properties.valuemax,
      text: properties.valuetext,
    }, {
      min: 0,
      max: 100,
      text: '100 of 100; cell 100',
    });
  });

  await check('REQ-UI-11/19 keeps a semantic, focusable, bounded matrix with all 10,002 results', async () => {
    const stress = await idlePage.evaluate(async () => {
      const prior = document.getElementById('browser-matrix-acceptance');
      prior?.remove();
      const host = document.createElement('div');
      host.id = 'browser-matrix-acceptance';
      document.body.append(host);
      const { MatrixView, MAX_MATRIX_ROWS } = await import('/src/app/ui.ts');
      const engines = Array.from({ length: 6 }, (_, index) => `stress-engine-${index}@1`);
      const scenarios = Array.from({ length: 1667 }, (_, index) => `probe/stress-${String(index).padStart(4, '0')}`);
      const longTasks = [];
      const observer = typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)))
        : undefined;
      observer?.observe({ type: 'longtask', buffered: true });
      const view = new MatrixView(host.id);
      const started = performance.now();
      view.start(engines, scenarios);
      const startDuration = performance.now() - started;
      await new Promise(requestAnimationFrame);
      observer?.disconnect();
      window.__BROWSER_ACCEPTANCE_MATRIX__ = view;
      return {
        engines,
        scenarios,
        maxRows: MAX_MATRIX_ROWS,
        renderedRows: view.getRenderedRowCount(),
        startDuration,
        longTasks,
        rowCount: host.querySelector('table')?.getAttribute('aria-rowcount'),
        colCount: host.querySelector('table')?.getAttribute('aria-colcount'),
        caption: host.querySelector('caption')?.textContent,
        firstRowIndex: host.querySelector('tbody tr')?.getAttribute('aria-rowindex'),
        lastRowIndex: host.querySelector('tbody tr:last-child')?.getAttribute('aria-rowindex'),
        rowScope: host.querySelector('tbody th')?.getAttribute('scope'),
        columnScopes: [...host.querySelectorAll('thead th')].map((node) => node.getAttribute('scope')),
        scrollTabIndex: host.querySelector('.matrix-scroll')?.getAttribute('tabindex'),
      };
    });
    assert.equal(stress.engines.length * stress.scenarios.length, 10_002);
    assert(stress.renderedRows <= stress.maxRows);
    assert.equal(stress.renderedRows, 75);
    assert.equal(stress.rowCount, '1668');
    assert.equal(stress.colCount, '7');
    assert.match(stress.caption, /Conformance verdicts and measured metrics/);
    assert.equal(stress.firstRowIndex, '2');
    assert.equal(stress.lastRowIndex, '76');
    assert.equal(stress.rowScope, 'row');
    assert(stress.columnScopes.every((scope) => scope === 'col'));
    assert.equal(stress.scrollTabIndex, '0');
    assert(stress.startDuration < 250, `bounded initial page took ${stress.startDuration.toFixed(1)} ms`);
    assert.equal(stress.longTasks.filter((duration) => duration >= 250).length, 0);

    await keyboardActivate(idlePage, '#browser-matrix-acceptance .matrix-pages button:last-child');
    assert.equal(await idlePage.locator('#browser-matrix-acceptance tbody tr').first().getAttribute('aria-rowindex'), '77');
    await keyboardActivate(idlePage, '#browser-matrix-acceptance .matrix-pages button:first-child');
    assert.equal(await idlePage.locator('#browser-matrix-acceptance tbody tr').first().getAttribute('aria-rowindex'), '2');

    await idlePage.evaluate(() => {
      const view = window.__BROWSER_ACCEPTANCE_MATRIX__;
      view.update({
        engineId: 'stress-engine-0@1', browser: 'chromium', scenarioId: 'probe/stress-0000', family: 'probe',
        status: 'PASS', reason: 'cached exact evidence',
        oracleOutcomes: [{ state: 'VERDICT', oracle: 'golden-metadata', verdict: 'PASS', reasonCode: 'BROWSER_ACCEPTANCE_PASS' }],
        cacheReuse: {
          schema: 'media-test/cache-reuse@1', sourceKey: 'stress-source', sourceObservationHash: 'a'.repeat(64),
          sourceRunId: 'stress-prior-run', createdAtIso: '2026-07-16T00:00:00.000Z',
          originalOrigin: location.origin, validationEpoch: 'stress-epoch', validBecause: 'identity matched',
        },
      });
    });
    await keyboardActivate(idlePage, '#browser-matrix-acceptance .matrix-pages button:last-child');
    await keyboardActivate(idlePage, '#browser-matrix-acceptance .matrix-pages button:first-child');
    assert.match(await idlePage.locator('#browser-matrix-acceptance tbody tr').first().innerText(), /PASS/);
    await keyboardActivate(idlePage, '#browser-matrix-acceptance tbody tr:first-child details summary', 'Enter');
    assert.match(await idlePage.locator('#browser-matrix-acceptance tbody tr').first().innerText(), /cache hit from run stress-prior-run/);

    const filled = await idlePage.evaluate(async () => {
      const view = window.__BROWSER_ACCEPTANCE_MATRIX__;
      const engines = Array.from({ length: 6 }, (_, index) => `stress-engine-${index}@1`);
      const scenarios = Array.from({ length: 1667 }, (_, index) => `probe/stress-${String(index).padStart(4, '0')}`);
      let produced = 1;
      let batch = 0;
      for (const scenarioId of scenarios) {
        for (const engineId of engines) {
          if (scenarioId === scenarios[0] && engineId === engines[0]) continue;
          view.update({
            engineId, browser: 'chromium', scenarioId, family: 'probe', status: 'NA_ENGINE',
            reason: 'stress tuple intentionally unsupported', oracleOutcomes: [],
          });
          produced++;
          if (++batch === 100) {
            batch = 0;
            await new Promise(requestAnimationFrame);
          }
        }
      }
      view.finish();
      const exported = view.getResults();
      return {
        produced,
        modelCount: exported.length,
        serializedCount: JSON.parse(JSON.stringify(exported)).length,
        renderedRows: view.getRenderedRowCount(),
        totalCounter: document.getElementById('stat-total')?.textContent,
      };
    });
    assert.deepEqual(filled, {
      produced: 10_002,
      modelCount: 10_002,
      serializedCount: 10_002,
      renderedRows: 75,
      totalCounter: '10002',
    });
  });

  const runPage = await openSuite(context, firstServer.url);
  const selection = await runPage.evaluate(async () => {
    const { listScenarios } = await import('/src/core/registry.ts');
    const scenario = listScenarios().find((candidate) => candidate.id === 'probe/micro_h264_1frame');
    if (!scenario) throw new Error('probe/micro_h264_1frame is not registered');
    const engineId = window.__SUITE__?.engineIds.find((id) => id === 'mp4box' || id.startsWith('mp4box@'));
    const cancelEngineId = window.__SUITE__?.engineIds.find((id) => id.startsWith('web-demuxer@'));
    if (!engineId || !cancelEngineId) {
      throw new Error(`required browser engines are not registered; saw ${window.__SUITE__?.engineIds.join(', ')}`);
    }
    return { id: scenario.id, family: scenario.family, operation: scenario.op, engineId, cancelEngineId };
  });

  await check('REQ-UI-08/09/17 shows immutable manifest, selected SHA, and attributed cache reuse', async () => {
    const first = await runPage.evaluate(async (filter) => await window.__SUITE__.run(filter), runFilter(selection));
    assert.equal(first.length, 1);
    assert(['PASS', 'DIFF', 'FAIL'].includes(first[0].status), `unexpected first status ${first[0].status}: ${first[0].reason}`);
    assert.equal(await runPage.evaluate(() => window.__RUN_ARTIFACT__?.completionState), 'completed');
    const firstManifest = await runPage.locator('#run-manifest').innerText();
    assert.match(firstManifest, /browser-acceptance-seed/);
    assert.match(firstManifest, /SHA-256 [a-f0-9]{64}/i);
    assert.match(firstManifest, /candidate\(s\)/i);

    const cacheProbe = await runPage.evaluate(async (liveResult) => {
      const [{ createResultCache }, { canonicalJsonSha256 }, { isExecutionFingerprintReusable }] = await Promise.all([
        import('/src/app/result-cache.ts'),
        import('/src/core/canonical-json.ts'),
        import('/src/core/runner.ts'),
      ]);
      const cache = createResultCache();
      if (!cache) throw new Error('browser cache unavailable');
      const rows = await cache.list();
      const row = rows.find((candidate) => candidate.result.engineId === liveResult.engineId);
      if (!row) throw new Error('first run did not persist a row');
      const selection = liveResult.selection;
      if (!selection) throw new Error('first run omitted selection evidence');
      const tag = `selection-sha256:${canonicalJsonSha256({
        schema: 'media-test/selection-cache-contract@1',
        executedInput: `sha256:${selection.executedInputDigest ?? selection.sha256}`,
        eligiblePoolDigest: selection.eligiblePoolDigest ?? null,
        candidateIdentity: selection.candidateIdentity ?? null,
        evidenceContractDigest: selection.evidenceContractDigest ?? null,
        selectionPolicyVersion: selection.selectionPolicyVersion ?? null,
        selectionAlgorithmId: selection.selectionAlgorithmId ?? null,
      })}`;
      const expectedScenarioKey = `${liveResult.scenarioId}#${tag}`;
      const direct = await cache.get(liveResult.engineId, expectedScenarioKey, liveResult.browser);
      return {
        expectedScenarioKey,
        storedScenarioKey: row.result.scenarioId,
        storedInvalidated: row.invalidated,
        directHit: direct?.cacheReuse !== undefined,
        directReusable: isExecutionFingerprintReusable(direct, liveResult.executionFingerprint),
      };
    }, first[0]);
    assert.deepEqual(cacheProbe, {
      expectedScenarioKey: cacheProbe.expectedScenarioKey,
      storedScenarioKey: cacheProbe.expectedScenarioKey,
      storedInvalidated: false,
      directHit: true,
      directReusable: true,
    });

    const second = await runPage.evaluate(async (filter) => await window.__SUITE__.run(filter), runFilter(selection));
    assert.equal(second.length, 1);
    selection.status = second[0].status;
    assert(second[0].cacheReuse, 'identical full-manifest run did not produce attributed cache reuse');
    const secondManifest = await runPage.locator('#run-manifest').innerText();
    assert.match(secondManifest, /Attributed cache reuse/);
    assert.match(secondManifest, /source run run-/);
    assert.match(secondManifest, /why|matched|valid|identity|fingerprint/i);

    const summary = runPage.locator('#results details summary').first();
    await summary.focus();
    await runPage.keyboard.press('Enter');
    assert.equal(await summary.evaluate((node) => node.parentElement?.hasAttribute('open')), true);
    const details = await summary.locator('..').innerText();
    assert.match(details, new RegExp(selection.status));
    assert.match(details, /Cache/);
    assert.match(details, /cache hit from run/);
    assert.match(details, /Selected input/);
  });

  let rawArtifact;
  let cacheBundle;
  await check('REQ-UI-12/15 exports raw/report artifacts by keyboard with matching run facts', async () => {
    const rawText = await downloadWithKeyboard(runPage, '#download');
    const reportText = await downloadWithKeyboard(runPage, '#download-report-json');
    const markdown = await downloadWithKeyboard(runPage, '#download-report-md');
    rawArtifact = JSON.parse(rawText);
    const report = JSON.parse(reportText);
    assert.equal(rawArtifact.schemaId, RAW_RUN_SCHEMA_ID);
    assert.equal(rawArtifact.results.length, 1);
    assert.equal(report.run.runId, rawArtifact.runId);
    assert.equal(report.run.completionState, rawArtifact.completionState);
    assert.equal(report.run.resultCount, rawArtifact.results.length);
    assert(markdown.includes(`Run id: \`${rawArtifact.runId}\``));
    assert(markdown.includes(`Completion: **${rawArtifact.completionState}**`));
    assert(markdown.includes('Cells: 1'));
    assert.equal(await runPage.locator('#live-status').innerText(), `Report Markdown export started for ${rawArtifact.runId}.`);

    const cacheText = await downloadWithKeyboard(runPage, '#export-cache');
    cacheBundle = JSON.parse(cacheText);
    assert(cacheBundle.entries.length >= 1);
  });

  await check('REQ-UI-18 proves cache origin isolation and explicit validated import provenance', async () => {
    const secondOrigin = await openSuite(context, secondServer.url);
    const before = await secondOrigin.locator('#cache-status').innerText();
    assert.match(before, /0 entries/);
    assert(before.includes(secondServer.url));
    const imported = await secondOrigin.evaluate(async ({ bundle }) => {
      return await window.__SUITE__.importCache(bundle, 'first-origin-cache.json');
    }, { bundle: cacheBundle });
    assert.equal(imported, cacheBundle.entries.length);
    const after = await secondOrigin.locator('#cache-status').innerText();
    assert.match(after, new RegExp(`${imported} entr(?:y|ies)`));
    assert.match(after, /Imported from http:\/\/127\.0\.0\.1:/);
    assert.match(after, /bundle [a-f0-9]{64}/);
    const importedReuse = await secondOrigin.evaluate(
      async (filter) => await window.__SUITE__.run(filter),
      runFilter(selection),
    );
    assert.equal(importedReuse.length, 1);
    assert(importedReuse[0].cacheReuse, 'explicitly imported row was not reusable under the same current policy');
    assert.match(importedReuse[0].cacheReuse.importedFrom, /first-origin-cache\.json/);
    assert.equal(
      await secondOrigin.evaluate(() => window.__RUN_ARTIFACT__?.completionState),
      'completed',
      'imported cache reuse did not produce a valid canonical artifact',
    );
    await secondOrigin.close();
  });

  await check('REQ-UI-11/12 remains reachable with keyboard at narrow 200% zoom', async () => {
    await runPage.setViewportSize({ width: 640, height: 720 });
    await runPage.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const layout = await runPage.evaluate(() => {
      const scroll = document.querySelector('#results .matrix-scroll');
      const table = scroll?.querySelector('table');
      const caption = table?.querySelector('caption');
      const summary = table?.querySelector('details summary');
      return {
        scrollTabIndex: scroll?.getAttribute('tabindex'),
        scrollWidth: scroll?.scrollWidth,
        clientWidth: scroll?.clientWidth,
        caption: caption?.textContent,
        columnScopes: [...(table?.querySelectorAll('thead th') ?? [])].map((node) => node.getAttribute('scope')),
        rowScope: table?.querySelector('tbody th')?.getAttribute('scope'),
        summaryLabel: summary?.getAttribute('aria-label'),
      };
    });
    assert.equal(layout.scrollTabIndex, '0');
    assert(layout.scrollWidth > layout.clientWidth, 'matrix did not expose deliberate horizontal overflow');
    assert.match(layout.caption, /Conformance verdicts/);
    assert(layout.columnScopes.every((scope) => scope === 'col'));
    assert.equal(layout.rowScope, 'row');
    assert.match(layout.summaryLabel, new RegExp(`${selection.id}.*mp4box.*${selection.status}`, 'i'));

    for (const selector of ['#run', '#download', '#results .matrix-scroll', '#results details summary']) {
      const locator = runPage.locator(selector).first();
      await locator.scrollIntoViewIfNeeded();
      await locator.focus();
      assert.equal(await locator.evaluate((node) => document.activeElement === node), true, `${selector} is not keyboard reachable`);
      const box = await locator.boundingBox();
      assert(box && box.width > 0 && box.height > 0, `${selector} is clipped at 200% zoom`);
    }
    await runPage.evaluate(() => { document.documentElement.style.zoom = ''; });
  });

  await check('REQ-UI-12/13 keeps Stop focused, exports coherent partial state, and confirms cache clear', async () => {
    await runPage.reload({ waitUntil: 'domcontentloaded' });
    await runPage.waitForFunction(() => window.__SUITE__?.ready === true);
    const muxIds = await runPage.evaluate(async () => {
      const { listScenarios } = await import('/src/core/registry.ts');
      return listScenarios().filter((scenario) => scenario.op === 'mux').slice(0, 20).map((scenario) => scenario.id);
    });
    assert(muxIds.length > 1);

    await keyboardActivate(runPage, '#clear-engines');
    await keyboardActivate(runPage, `#engines-list input[value="${selection.cancelEngineId}"]`);
    await keyboardActivate(runPage, '#clear-scenarios');
    for (const id of muxIds) {
      await runPage.locator('#scenarios-list input').filter({ has: undefined }).evaluateAll((nodes, wanted) => {
        const node = nodes.find((candidate) => candidate.value === wanted);
        if (!node) throw new Error(`missing scenario checkbox ${wanted}`);
        node.focus();
      }, id);
      await runPage.keyboard.press('Space');
    }
    if (await runPage.locator('#randomize-order').isChecked()) await keyboardActivate(runPage, '#randomize-order');
    await keyboardActivate(runPage, '#run');
    await runPage.waitForFunction(() => document.body.dataset.runState === 'running', undefined, { timeout: 10_000 });
    assert.equal(await runPage.evaluate(() => document.activeElement?.id), 'run');
    await runPage.keyboard.press('Space');
    await runPage.waitForFunction(() => window.__RUN_DONE__ === true, undefined, { timeout: 30_000 });
    assert.equal(await runPage.evaluate(() => document.activeElement?.id), 'run');
    assert.equal(await runPage.evaluate(() => window.__RUN_ARTIFACT__?.completionState), 'completed-partial');
    assert.match(await runPage.locator('#run-status').innerText(), /completed-partial|stop/i);
    assert.equal(await runPage.locator('#download').isEnabled(), true);
    const partialText = await downloadWithKeyboard(runPage, '#download');
    const partial = JSON.parse(partialText);
    assert.equal(partial.completionState, 'completed-partial');
    assert.match(partial.partialReason, /stop/i);
    assert.equal(partial.results.length, partial.manifest.observedCellCount);

    let confirmation = '';
    runPage.once('dialog', async (dialog) => {
      confirmation = dialog.message();
      await dialog.accept();
    });
    await keyboardActivate(runPage, '#clear-cache');
    await runPage.waitForFunction(() => document.getElementById('run-status')?.textContent?.includes('Cleared'));
    assert.match(confirmation, /Clear all cached results for this origin/i);
    assert.equal(await runPage.evaluate(() => document.activeElement?.id), 'run');
  });

  await context.close();
  console.log(`1..${checks.length}`);
  console.log(`browser acceptance complete: ${checks.length} checks`);
} finally {
  await browser?.close().catch(() => {});
  await Promise.all([stopVite(firstServer), stopVite(secondServer)]);
}
