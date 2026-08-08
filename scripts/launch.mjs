#!/usr/bin/env bun
/** Playwright launcher only: all measurement and verdict formation remain inside the browser page. */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RUN_OPTION_DEFINITIONS,
  RUN_OPTION_LIMITS,
} from '../src/app/options.ts';
import {
  isLauncherRunDone,
  isLauncherRunPending,
  LAUNCHER_RUN_HANDSHAKE_SCHEMA,
} from '../src/app/launcher-handshake.ts';
import { validateCanonicalRunArtifact, withLauncherProvenance } from '../src/app/run-artifact.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opts = {
  baseUrl: 'http://127.0.0.1:5151',
  browser: 'brave',
  engines: [],
  features: [],
  operations: [],
  scenarios: [],
  pillar: 'all',
  out: 'results/raw',
  warmup: undefined,
  iters: undefined,
  timeoutMs: RUN_OPTION_LIMITS.timeoutMs.default,
  reuseData: true,
  exhaustive: false,
};

const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index++) {
  const argument = argv[index];
  const next = () => {
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    return value;
  };
  const list = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);
  switch (argument) {
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
    case '--exhaustive': opts.exhaustive = true; break;
    case '--no-reuse': opts.reuseData = false; break;
    case '--help-canonical':
      printCanonicalHelp();
      process.exit(0);
    case '-h':
    case '--help':
      printHelp();
      process.exit(0);
    default:
      throw new Error(`launch.mjs: unknown argument '${argument}'`);
  }
}

validateNumericOption('--warmup', opts.warmup ?? RUN_OPTION_LIMITS.warmup.default, RUN_OPTION_LIMITS.warmup);
validateNumericOption('--iters', opts.iters ?? RUN_OPTION_LIMITS.iters.default, RUN_OPTION_LIMITS.iters);
validateNumericOption('--timeout-ms', opts.timeoutMs, RUN_OPTION_LIMITS.timeoutMs);
if (!['functional', 'performance', 'robustness', 'all'].includes(opts.pillar)) {
  throw new Error('--pillar must be functional, performance, robustness, or all');
}

function printHelp() {
  console.log('bun scripts/launch.mjs [launcher options] [canonical run options]');
  console.log('Launcher options: --base-url <URL> --out <directory>');
  console.log('The launcher opens a visible browser window.');
  printCanonicalHelp();
}

function printCanonicalHelp() {
  for (const option of RUN_OPTION_DEFINITIONS) {
    const takesValue = option.value !== 'boolean' && option.value !== 'false';
    console.log(`  ${option.cli}${takesValue ? ` <${option.value}>` : ''}${option.repeatable ? ' (repeatable or CSV)' : ''}`);
  }
}

function validateNumericOption(name, value, limits) {
  if (!Number.isSafeInteger(value) || value < limits.min || value > limits.max) {
    throw new Error(`${name} must be an integer from ${limits.min} to ${limits.max}`);
  }
}

const bravePath = process.env.BRAVE_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const browserDefinitions = {
  brave: { type: 'chromium', executablePath: bravePath },
  chromium: { type: 'chromium' },
  webkit: { type: 'webkit' },
  firefox: { type: 'firefox' },
};
const browserDefinition = browserDefinitions[opts.browser];
if (!browserDefinition) throw new Error(`unknown --browser '${opts.browser}' (use brave|chromium|webkit|firefox)`);
if (browserDefinition.executablePath && !existsSync(browserDefinition.executablePath)) {
  throw new Error(`browser executable not found at '${browserDefinition.executablePath}'; set BRAVE_PATH or choose another browser`);
}

let playwright;
try {
  playwright = await import('playwright');
} catch (error) {
  throw new Error(`failed to import Playwright: ${error?.message || error}`);
}

const pageUrl = `${opts.baseUrl.replace(/\/$/, '')}/index.html?autorun=0`;
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const launchRequestId = `launcher-${runStamp}-${process.pid}`;
const launchOptions = { headless: false };
if (browserDefinition.executablePath) launchOptions.executablePath = browserDefinition.executablePath;
console.log(`[launch] ${opts.browser} (visible browser window) → ${pageUrl}`);
console.log(`[launch] cache reuse is origin-scoped to ${new URL(opts.baseUrl).origin}; cross-port import is explicit`);

const userDataDir = resolve(ROOT, 'results/.browser-cache', opts.browser);
mkdirSync(userDataDir, { recursive: true });
const browserType = playwright[browserDefinition.type];
const context = await browserType.launchPersistentContext(userDataDir, launchOptions);
const browser = context.browser();
let page;
let activeFilter = null;
let exitCode = 0;

try {
  page = context.pages()[0] ?? await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[page:${opts.browser}] ${message.text()}`);
    else if (message.type() === 'warning') console.warn(`[page:${opts.browser}] ${message.text()}`);
  });
  page.on('pageerror', (error) => console.error(`[pageerror:${opts.browser}] ${error.message}`));
  await page.goto(pageUrl, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(
    () => window.__SUITE__?.ready === true || typeof window.__SUITE_ERROR__ === 'string',
    null,
    { timeout: 120_000 },
  );
  const bootError = await page.evaluate(() => window.__SUITE_ERROR__ ?? null);
  if (bootError) throw new Error(`suite boot failed: ${bootError}`);
  const info = await page.evaluate(() => ({
    engineCount: window.__SUITE__.engineIds.length,
    scenarioCount: window.__SUITE__.scenarioIds.length,
    handshakeSchema: window.__SUITE__.handshakeSchema,
  }));
  if (info.handshakeSchema !== LAUNCHER_RUN_HANDSHAKE_SCHEMA) {
    throw new Error(
      `suite launcher handshake protocol mismatch: expected ${LAUNCHER_RUN_HANDSHAKE_SCHEMA}, ` +
      `received ${String(info.handshakeSchema)}`,
    );
  }
  console.log(`[launch] booted ${info.engineCount} scored engines and ${info.scenarioCount} scenarios`);

  activeFilter = {
    browser: opts.browser,
    pillar: opts.pillar,
    reuseData: opts.reuseData,
    timeoutMs: opts.timeoutMs,
    ...(opts.engines.length ? { engineIds: opts.engines } : {}),
    ...(opts.features.length ? { featureIds: opts.features } : {}),
    ...(opts.operations.length ? { operations: opts.operations } : {}),
    ...(opts.scenarios.length ? { scenarioIds: opts.scenarios } : {}),
    ...(opts.warmup !== undefined ? { warmup: opts.warmup } : {}),
    ...(opts.iters !== undefined ? { iters: opts.iters } : {}),
    ...(opts.exhaustive ? { exhaustiveMedia: true } : {}),
  };
  if (!opts.reuseData) console.log('[launch] forced-fresh policy enabled');
  await page.evaluate(({ requestId, filter }) => {
    window.__SUITE__.start(requestId, filter);
  }, { requestId: launchRequestId, filter: activeFilter });

  const acceptedHandshake = await page.evaluate(() => window.__RUN_HANDSHAKE__ ?? null);
  if (acceptedHandshake?.requestId !== launchRequestId ||
      !['started', 'done'].includes(acceptedHandshake?.state)) {
    throw new Error(`suite did not accept launcher run request ${launchRequestId}`);
  }

  const started = Date.now();
  let lastLog = started;
  let lastSnapshotCount = -1;
  for (;;) {
    const handshake = await page.evaluate(() => window.__RUN_HANDSHAKE__ ?? null);
    if (isLauncherRunDone(handshake, launchRequestId)) break;
    const now = Date.now();
    if (now - started > opts.timeoutMs) {
      await saveResultsPayload(page, `launcher timeout after ${opts.timeoutMs} ms`, {
        snapshot: true,
        completionState: 'failed',
      });
      throw new Error(`run timed out after ${opts.timeoutMs} ms`);
    }
    if (now - lastLog >= 15_000) {
      const snapshot = await saveResultsPayload(page, 'incremental launcher snapshot', {
        snapshot: true,
        quiet: true,
      });
      if (snapshot && snapshot.results.length !== lastSnapshotCount) {
        console.log(`[launch] snapshot: ${snapshot.results.length} results → ${snapshot.outPath.replace(`${ROOT}/`, '')}`);
        lastSnapshotCount = snapshot.results.length;
      }
      const label = await page.evaluate(() => document.getElementById('progress-label')?.textContent ?? '');
      if (label) console.log(`[launch] ${label}`);
      lastLog = now;
    }
    await page.waitForTimeout(500);
  }

  const runError = await page.evaluate(() => window.__SUITE_ERROR__ ?? null);
  await saveResultsPayload(page);
  if (runError) {
    console.error(`[launch] run reported a failure; canonical partial artifact saved: ${runError}`);
    exitCode = 1;
  }
} catch (error) {
  console.error(`[launch] FAILED: ${error?.message || error}`);
  if (page) {
    try {
      await saveResultsPayload(page, `launcher failure: ${error?.message || error}`, { completionState: 'failed' });
    } catch (saveError) {
      console.error(`[launch] canonical partial save failed: ${saveError?.message || saveError}`);
    }
  }
  exitCode = 1;
} finally {
  await context.close();
}

process.exit(exitCode);

async function saveResultsPayload(page, partialReason, options = {}) {
  const pageArtifact = await page.evaluate(async ({ completionState, reason }) => {
    if (!window.__SUITE__) throw new Error('suite control surface is unavailable');
    return await window.__SUITE__.snapshot(completionState, reason);
  }, { completionState: options.completionState, reason: partialReason });
  if (!pageArtifact) {
    const pageDiagnostic = await page.evaluate(() => ({
      runError: window.__SUITE_ERROR__ ?? null,
      handshake: window.__RUN_HANDSHAKE__ ?? null,
      validation: document.getElementById('validation-message')?.textContent?.trim() ?? '',
      status: document.getElementById('run-status')?.textContent?.trim() ?? '',
    }));
    // A launcher request is accepted synchronously, but the app still needs to resolve concrete
    // engine identities and the initial cache manifest before it can construct an ActiveRun and a
    // canonical partial artifact. An incremental snapshot during that bounded pre-run phase is
    // simply not ready yet; it must not abort the accepted request.
    if (options.snapshot && options.quiet &&
        isLauncherRunPending(pageDiagnostic.handshake, launchRequestId)) {
      return undefined;
    }
    const detail = pageDiagnostic.runError || pageDiagnostic.validation || pageDiagnostic.status;
    throw new Error(
      `page has no run artifact to save${detail ? `: ${detail}` : ''}; ` +
      `handshake=${JSON.stringify(pageDiagnostic.handshake)}`,
    );
  }
  const validated = validateCanonicalRunArtifact(pageArtifact);
  const payload = withLauncherProvenance(validated, {
    playwrightBrowser: opts.browser,
    playwrightVersion: browser?.version?.() ?? null,
    filter: activeFilter,
  });
  // The filesystem writer re-validates after launcher provenance is attached. The only duplicate
  // representation here is the serialized file itself; there is one top-level results array.
  validateCanonicalRunArtifact(payload);

  const outDir = resolve(ROOT, opts.out);
  const outPath = options.snapshot
    ? join(outDir, '.partial', `${opts.browser}-${runStamp}.partial.json`)
    : join(outDir, `${opts.browser}-${runStamp}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  const counts = {};
  for (const result of payload.results) {
    const label = result.coverage?.grade === 'partial' ? 'Partial' : result.status;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  if (!options.quiet) {
    console.log(`[launch] ${payload.completionState}: ${payload.results.length} results (${Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(' ')}) → ${outPath}`);
  }
  return { ...payload, outPath };
}
