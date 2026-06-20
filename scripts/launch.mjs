#!/usr/bin/env bun
/**
 * scripts/launch.mjs — the Playwright driver. LAUNCHER ONLY (§10, §13): it opens the suite page in a
 * real browser, triggers a run through the page's `window.__SUITE__` control surface, and collects
 * the results JSON the page exposes (`window.__RESULTS__`). IT PERFORMS NO MEASUREMENT — every number
 * is produced in-page by the suite; this script only automates clicking "Run" and saving the output.
 *
 * Runs under bun (the project uses bun exclusively; node/npm/npx are unavailable). It uses only the
 * node: builtins bun implements (fs/path/url) plus the installed `playwright` module.
 *
 * It assumes a static server is already running (scripts/run.sh starts one and passes --base-url).
 * Browsers map to Playwright engines: chromium→chromium, webkit→webkit, firefox→firefox.
 *
 * Usage (normally invoked by scripts/run.sh, but runnable directly):
 *   bun scripts/launch.mjs --base-url http://localhost:5173 --browser chromium \
 *        [--engine <id>] [--pillar functional|performance|robustness|all] \
 *        [--feature <id>] [--operation <op>] [--scenario <id>] \
 *        [--out results/raw] [--warmup N] [--iters N] [--timeout-ms MS] [--headed]
 *
 * --engine/--scenario/--pillar are forwarded as a run filter. --engine/--scenario may repeat or be
 * comma-separated. Output: results/raw/<browser>-<timestamp>.json (the same payload the in-page
 * Download button writes), plus a console summary line.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── arg parsing ────────────────────────────────────────────────────────────────────────────────

const opts = {
  baseUrl: 'http://localhost:5173',
  browser: 'brave', // default to a REAL, non-headless browser (user mandate: no headless testing)
  engines: /** @type {string[]} */ ([]),
  features: /** @type {string[]} */ ([]),
  operations: /** @type {string[]} */ ([]),
  scenarios: /** @type {string[]} */ ([]),
  pillar: 'all',
  out: 'results/raw',
  warmup: undefined,
  iters: undefined,
  timeoutMs: 30 * 60 * 1000, // 30 min default cap for a whole matrix run
  headed: false,
};

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  switch (a) {
    case '--base-url': opts.baseUrl = next(); break;
    case '--browser': opts.browser = next(); break;
    case '--engine': opts.engines.push(...list(next())); break;
    case '--feature': opts.features.push(...list(next())); break;
    case '--operation': opts.operations.push(...list(next())); break;
    case '--scenario': opts.scenarios.push(...list(next())); break;
    case '--pillar': opts.pillar = next(); break;
    case '--out': opts.out = next(); break;
    case '--warmup': opts.warmup = Number(next()); break;
    case '--iters': opts.iters = Number(next()); break;
    case '--timeout-ms': opts.timeoutMs = Number(next()); break;
    case '--headed': opts.headed = true; break;
    case '-h': case '--help':
      console.log('bun scripts/launch.mjs --base-url URL --browser brave|chromium|webkit|firefox (always non-headless) [--feature id] [--operation op] [--engine id] [--scenario id] [--pillar p] [--out dir] [--warmup N] [--iters N] [--timeout-ms MS]');
      process.exit(0);
    default:
      console.error(`launch.mjs: unknown arg '${a}'`);
      process.exit(2);
  }
}

// ALL runs use a REAL, NON-HEADLESS browser (user mandate: remove all headless testing). 'brave'
// launches the system Brave binary through Playwright's chromium driver (Brave is Chromium-based);
// chromium/webkit/firefox use Playwright's bundled engines, also non-headless. Playwright stays a
// pure LAUNCHER (§13) — it opens the served web app and triggers the in-page run; it measures nothing.
const BRAVE_PATH =
  process.env.BRAVE_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BROWSERS = {
  brave: { type: 'chromium', executablePath: BRAVE_PATH },
  chromium: { type: 'chromium' },
  webkit: { type: 'webkit' },
  firefox: { type: 'firefox' },
};
if (!BROWSERS[opts.browser]) {
  console.error(`launch.mjs: unknown --browser '${opts.browser}' (use brave|chromium|webkit|firefox)`);
  process.exit(2);
}

// ── playwright import (resolved by bun from node_modules) ────────────────────────────────────────

let playwright;
try {
  playwright = await import('playwright');
} catch (err) {
  console.error(
    'launch.mjs: failed to import playwright. Install it (bun add -d playwright; bunx playwright install) ' +
      `then retry. Original error: ${err?.message || err}`,
  );
  process.exit(3);
}

// ── drive one browser ────────────────────────────────────────────────────────────────────────

const browserCfg = BROWSERS[opts.browser];
const browserType = playwright[browserCfg.type];
const pageUrl = `${opts.baseUrl.replace(/\/$/, '')}/index.html?autorun=0`;
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');

// NEVER headless. If a custom executablePath is required (Brave), verify it exists up front so we
// fail with a clear message instead of a cryptic Playwright spawn error.
const launchOpts = { headless: false };
if (browserCfg.executablePath) {
  if (!existsSync(browserCfg.executablePath)) {
    console.error(
      `launch.mjs: ${opts.browser} binary not found at '${browserCfg.executablePath}'. ` +
        `Set BRAVE_PATH to the Brave executable, or use --browser chromium.`,
    );
    process.exit(4);
  }
  launchOpts.executablePath = browserCfg.executablePath;
}

console.log(`[launch] ${opts.browser} (real browser, non-headless) → ${pageUrl}`);
const userDataDir = resolve(ROOT, 'results/.browser-cache', opts.browser);
mkdirSync(userDataDir, { recursive: true });
console.log(`[launch] ${opts.browser} profile/cache → ${userDataDir.replace(ROOT + '/', '')}`);
const context = await browserType.launchPersistentContext(userDataDir, launchOpts);
const browser = context.browser();
let exitCode = 0;
let page;
let activeFilter = null;
try {
  page = context.pages()[0] ?? await context.newPage();

  // Surface page console errors + warnings to the driver log (debugging only — not measurement).
  // Warnings matter here because the runner WARN+SKIPs unknown --engine/--scenario ids instead of
  // aborting; forwarding them tells the operator why a requested id produced no cells.
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') console.error(`[page:${opts.browser}] ${msg.text()}`);
    else if (type === 'warning') console.warn(`[page:${opts.browser}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[pageerror:${opts.browser}] ${err.message}`));

  await page.goto(pageUrl, { waitUntil: 'load', timeout: 60_000 });

  // Wait for the suite to finish booting (registration + feature-detect) → window.__SUITE__.ready,
  // or fail fast if boot threw (window.__SUITE_ERROR__).
  await page.waitForFunction(() => window.__SUITE__?.ready === true || typeof window.__SUITE_ERROR__ === 'string', null, {
    timeout: 120_000,
  });
  const bootError = await page.evaluate(() => window.__SUITE_ERROR__ ?? null);
  if (bootError) throw new Error(`suite boot failed in ${opts.browser}: ${bootError}`);

  const suiteInfo = await page.evaluate(() => ({
    engineIds: window.__SUITE__.engineIds,
    scenarioIds: window.__SUITE__.scenarioIds,
    referenceEngineId: window.__SUITE__.referenceEngineId,
    env: window.__SUITE__.env,
  }));
  console.log(
    `[launch] ${opts.browser} booted: ${suiteInfo.engineIds.length} engines, ` +
      `${suiteInfo.scenarioIds.length} scenarios; ref=${suiteInfo.referenceEngineId}`,
  );

  const reusableResults = loadReusableResultsForSeed(opts.browser);
  const seeded = await seedReusableResults(page, reusableResults);
  if (seeded > 0) {
    console.log(`[launch] ${opts.browser} seeded ${seeded} reusable PASS/N/A result(s) into the page cache`);
  }

  // Build the run filter from CLI flags. Empty arrays mean "all".
  const filter = {
    browser: opts.browser,
    pillar: opts.pillar,
    reuseSuccessful: true,
    ...(opts.engines.length ? { engineIds: opts.engines } : {}),
    ...(opts.features.length ? { featureIds: opts.features } : {}),
    ...(opts.operations.length ? { operations: opts.operations } : {}),
    ...(opts.scenarios.length ? { scenarioIds: opts.scenarios } : {}),
    ...(Number.isFinite(opts.warmup) ? { warmup: opts.warmup } : {}),
    ...(Number.isFinite(opts.iters) ? { iters: opts.iters } : {}),
  };
  activeFilter = filter;

  // Trigger the run IN THE PAGE (the page measures; we only kick it off and await completion).
  console.log(
    `[launch] ${opts.browser} running matrix (` +
      `pillar=${opts.pillar}` +
      `${opts.features.length ? `, features=${opts.features.join(',')}` : ''}` +
      `${opts.operations.length ? `, operations=${opts.operations.join(',')}` : ''}` +
      `${opts.engines.length ? `, engines=${opts.engines.join(',')}` : ''}` +
      `)…`,
  );
  await page.evaluate((f) => {
    // Fire and forget inside the page; we poll __RUN_DONE__ from the driver so a very long run does
    // not exceed a single evaluate() call's bound.
    window.__RUN_DONE__ = false;
    window.__SUITE__.run(f).catch((e) => {
      window.__SUITE_ERROR__ = String(e?.message || e);
      window.__RUN_DONE__ = true;
    });
  }, filter);

  // Poll for completion up to the timeout. Report progress occasionally.
  const start = Date.now();
  let lastLog = 0;
  let lastSnapshotCount = -1;
  for (;;) {
    const done = await page.evaluate(() => window.__RUN_DONE__ === true);
    if (done) break;
    const now = Date.now();
    if (now - start > opts.timeoutMs) {
      await saveResultsPayload(page, `launcher timeout snapshot after ${opts.timeoutMs}ms`, {
        snapshot: true,
        quiet: false,
      });
      throw new Error(`run timed out after ${opts.timeoutMs}ms in ${opts.browser}`);
    }
    if (now - lastLog > 15_000) {
      const snapshot = await saveResultsPayload(page, 'incremental snapshot while run is still active', {
        snapshot: true,
        quiet: true,
      });
      if (snapshot.results.length !== lastSnapshotCount) {
        console.log(
          `[launch] ${opts.browser} snapshot: ${snapshot.results.length} results → ${snapshot.outPath.replace(ROOT + '/', '')}`,
        );
        lastSnapshotCount = snapshot.results.length;
      }
      const label = await page.evaluate(() => document.getElementById('progress-label')?.textContent ?? '');
      if (label) console.log(`[launch] ${opts.browser} … ${label}`);
      lastLog = now;
    }
    await page.waitForTimeout(500);
  }

  const runError = await page.evaluate(() => window.__SUITE_ERROR__ ?? null);

  await saveResultsPayload(page);

  if (runError) {
    console.error(`[launch] ${opts.browser} run reported an error (partial results saved): ${runError}`);
    exitCode = 1;
  }
} catch (err) {
  console.error(`[launch] ${opts.browser} FAILED: ${err?.message || err}`);
  if (page) {
    try {
      await saveResultsPayload(page, `launcher failure: ${err?.message || err}`);
    } catch (saveErr) {
      console.error(`[launch] ${opts.browser} partial save failed: ${saveErr?.message || saveErr}`);
    }
  }
  exitCode = 1;
} finally {
  await context.close();
}

process.exit(exitCode);

async function saveResultsPayload(page, partialReason, options = {}) {
  // Collect the results payload the page exposes (same shape as the Download button).
  const payload = await page.evaluate((reason) => ({
    schema: 'media-browser-test/results@1',
    generatedAtIso: new Date().toISOString(),
    env: window.__SUITE__.env,
    support: window.__SUITE__.support,
    referenceEngineId: window.__SUITE__.referenceEngineId,
    results: window.__RESULTS__ ?? [],
    ...(reason ? { partialReason: reason } : {}),
  }), partialReason ?? null);

  // Capture exact browser build for reproducibility (env.browserVersion may be UA-derived; the
  // Playwright build version is authoritative for the launcher record).
  payload.launcher = {
    playwrightBrowser: opts.browser,
    playwrightVersion: browser.version?.() ?? null,
    pillar: opts.pillar,
    filter: activeFilter,
  };

  const outDir = resolve(ROOT, opts.out);
  mkdirSync(outDir, { recursive: true });
  const outPath = options.snapshot
    ? join(outDir, '.partial', `${opts.browser}-${runStamp}.partial.json`)
    : join(outDir, `${opts.browser}-${runStamp}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');

  const counts = {};
  for (const r of payload.results) {
    const label = summaryStatusLabel(r.status);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  if (!options.quiet) {
    console.log(
      `[launch] ${opts.browser} ${partialReason ? 'partial' : 'done'}: ${payload.results.length} results ` +
        `(${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')}) → ${outPath}`,
    );
  }
  return { ...payload, outPath };
}

function summaryStatusLabel(status) {
  switch (status) {
    case 'PASS':
      return 'Pass';
    case 'NA_ENGINE':
    case 'NA_BROWSER':
    case 'NA_ASSET':
      return 'N/A';
    case 'FAIL':
      return 'Fail';
    case 'ERROR':
      return 'Error';
    case 'SKIPPED':
      return 'Skipped';
    default:
      return String(status || 'Unknown');
  }
}

function loadReusableResultsForSeed(browserName) {
  const rawDir = resolve(ROOT, opts.out);
  const files = resultFiles(rawDir).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  const byKey = new Map();
  for (const file of files) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const results = Array.isArray(payload.results) ? payload.results : Array.isArray(payload) ? payload : [];
    for (const result of results) {
      if (!result || result.browser !== browserName || !isReusableStatus(result.status)) continue;
      byKey.set(`${result.browser}\0${result.engineId}\0${result.scenarioId}`, result);
    }
  }
  return [...byKey.values()];
}

function resultFiles(rawDir) {
  const files = [];
  if (existsSync(rawDir)) {
    for (const name of readdirSync(rawDir)) {
      const path = join(rawDir, name);
      if (name.endsWith('.json')) files.push(path);
    }
  }
  const partialDir = join(rawDir, '.partial');
  if (existsSync(partialDir)) {
    for (const name of readdirSync(partialDir)) {
      const path = join(partialDir, name);
      if (name.endsWith('.json')) files.push(path);
    }
  }
  return files;
}

function isReusableStatus(status) {
  return status === 'PASS' || status === 'NA_ENGINE' || status === 'NA_BROWSER' || status === 'NA_ASSET';
}

async function seedReusableResults(page, results) {
  if (results.length === 0) return 0;
  return await page.evaluate(async (rows) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('media-browser-test-results', 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains('results')) {
          database.createObjectStore('results', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('failed to open result cache'));
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('results', 'readwrite');
        const store = tx.objectStore('results');
        const updatedAtIso = new Date().toISOString();
        for (const result of rows) {
          store.put({
            key: `${result.browser}\0${result.engineId}\0${result.scenarioId}`,
            updatedAtIso,
            result,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('failed to seed result cache'));
      });
    } finally {
      db.close();
    }
    return rows.length;
  }, results);
}
