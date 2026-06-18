#!/usr/bin/env bun
/**
 * Drive the in-browser frame-bake control surface and persist returned golden writes.
 *
 * The browser page does all decode/digest work through src/core/frame-bake.ts. This script is only the
 * orchestrator that opens the served app, calls window.__FRAME_BAKE__.run({ assetIds }), and writes the
 * returned { goldenFilename: jsonText } map under fixtures/golden/.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const opts = {
  baseUrl: 'http://localhost:5173',
  browser: 'brave',
  assetIds: /** @type {string[]} */ ([]),
  outDir: 'fixtures/golden',
  timeoutMs: 10 * 60 * 1000,
  force: false,
};

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  switch (a) {
    case '--base-url':
      opts.baseUrl = next();
      break;
    case '--browser':
      opts.browser = next();
      break;
    case '--asset':
      opts.assetIds.push(...list(next()));
      break;
    case '--out-dir':
      opts.outDir = next();
      break;
    case '--timeout-ms':
      opts.timeoutMs = Number(next());
      break;
    case '--force':
      opts.force = true;
      break;
    case '-h':
    case '--help':
      console.log(
        'bun scripts/frame-bake.mjs --base-url URL --browser brave|chromium|webkit|firefox --asset <assetId>[,<assetId>] [--force]',
      );
      process.exit(0);
    default:
      console.error(`frame-bake.mjs: unknown arg '${a}'`);
      process.exit(2);
  }
}

if (opts.assetIds.length === 0) {
  console.error('frame-bake.mjs: pass at least one --asset <assetId>');
  process.exit(2);
}

const BRAVE_PATH = process.env.BRAVE_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BROWSERS = {
  brave: { type: 'chromium', executablePath: BRAVE_PATH },
  chromium: { type: 'chromium' },
  webkit: { type: 'webkit' },
  firefox: { type: 'firefox' },
};
if (!BROWSERS[opts.browser]) {
  console.error(`frame-bake.mjs: unknown --browser '${opts.browser}'`);
  process.exit(2);
}

let playwright;
try {
  playwright = await import('playwright');
} catch (err) {
  console.error(`frame-bake.mjs: failed to import playwright: ${err?.message || err}`);
  process.exit(3);
}

const browserCfg = BROWSERS[opts.browser];
const launchOpts = { headless: false };
if (browserCfg.executablePath) {
  if (!existsSync(browserCfg.executablePath)) {
    console.error(`frame-bake.mjs: ${opts.browser} binary not found at '${browserCfg.executablePath}'`);
    process.exit(4);
  }
  launchOpts.executablePath = browserCfg.executablePath;
}

const browserType = playwright[browserCfg.type];
const pageUrl = `${opts.baseUrl.replace(/\/$/, '')}/index.html`;
console.log(`[frame-bake] ${opts.browser} -> ${pageUrl}`);

const browser = await browserType.launch(launchOpts);
let exitCode = 0;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') console.error(`[page:${opts.browser}] ${msg.text()}`);
    else if (type === 'warning') console.warn(`[page:${opts.browser}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[pageerror:${opts.browser}] ${err.message}`));

  await page.goto(pageUrl, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(
    () =>
      (window.__SUITE__?.ready === true && window.__FRAME_BAKE__?.ready === true) ||
      typeof window.__SUITE_ERROR__ === 'string',
    null,
    { timeout: 120_000 },
  );
  const bootError = await page.evaluate(() => window.__SUITE_ERROR__ ?? null);
  if (bootError) throw new Error(`suite boot failed: ${bootError}`);

  const start = Date.now();
  const reportPromise = page.evaluate(
    ({ assetIds, force }) => window.__FRAME_BAKE__.run({ assetIds, force }),
    { assetIds: opts.assetIds, force: opts.force },
  );
  let settled = false;
  const progress = (async () => {
    while (!settled) {
      if (Date.now() - start > opts.timeoutMs) throw new Error(`frame-bake timed out after ${opts.timeoutMs}ms`);
      await page.waitForTimeout(1000);
      const current = await page.evaluate(() => {
        const report = window.__FRAME_BAKE_REPORT__;
        if (window.__FRAME_BAKE_DONE__ && report) return 'done';
        return '';
      });
      if (current) break;
    }
  })();
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`frame-bake timed out after ${opts.timeoutMs}ms`)), opts.timeoutMs);
  });
  const report = await Promise.race([reportPromise, timeout]);
  settled = true;
  await progress.catch(() => {});

  const outDir = resolve(ROOT, opts.outDir);
  const writes = report.writes ?? {};
  let written = 0;
  for (const [rel, text] of Object.entries(writes)) {
    if (isAbsolute(rel) || rel.includes('..') || basename(rel) !== rel) {
      throw new Error(`refusing unsafe golden write path '${rel}'`);
    }
    const outPath = join(outDir, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    written++;
  }

  console.log(
    `[frame-bake] summary filled:${report.summary.filled} partial:${report.summary.partial} ` +
      `failed:${report.summary.failed} skipped:${report.summary.skipped}; wrote ${written} file(s)`,
  );
  for (const asset of report.assets) {
    console.log(`[frame-bake] ${asset.assetId}: ${asset.status} (${asset.filledFrames}/${asset.listedFrames}) ${asset.note}`);
  }
} catch (err) {
  console.error(`[frame-bake] FAILED: ${err?.message || err}`);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
