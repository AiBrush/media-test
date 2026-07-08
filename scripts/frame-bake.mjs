#!/usr/bin/env bun
/**
 * Drive the in-browser frame-bake control surface and persist returned golden writes.
 *
 * The browser page does all decode/digest work through src/core/frame-bake.ts. This script is only the
 * orchestrator that opens the served app, calls window.__FRAME_BAKE__.run({ assetIds }), and writes the
 * returned { goldenFilename: jsonText } map under fixtures/golden/.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * Enumerate the nested scenario frame PLACEHOLDERS on disk (fixtures/golden/scenarios/ ** /*.frames.json)
 * and return their asset ids (the golden path minus the fixtures/golden/ prefix and the .frames.json
 * suffix, e.g. 'scenarios/decode-seek/decode_av1/01.webm'). The browser page cannot list directories, so
 * this Node-side glob is how --scenario-frames hands the page an explicit id set to bake. Ids use forward
 * slashes (web/fetch style) regardless of the host OS path separator.
 */
function listScenarioFrameAssetIds(root) {
  const goldenRoot = resolve(root, 'fixtures/golden');
  const scenariosRoot = join(goldenRoot, 'scenarios');
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // no scenarios/ tree yet (run bake-scenario-goldens.mjs --frames first)
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.frames.json')) {
        const rel = relative(goldenRoot, p).split(sep).join('/');
        out.push(rel.slice(0, -'.frames.json'.length));
      }
    }
  };
  walk(scenariosRoot);
  return out.sort();
}

const opts = {
  baseUrl: 'http://localhost:5173',
  browser: 'brave',
  assetIds: /** @type {string[]} */ ([]),
  outDir: 'fixtures/golden',
  timeoutMs: 10 * 60 * 1000,
  force: false,
  scenarioFrames: false,
  headless: false,
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
    case '--scenario-frames':
      opts.scenarioFrames = true;
      break;
    case '--headless':
      opts.headless = true;
      break;
    case '-h':
    case '--help':
      console.log(
        'bun scripts/frame-bake.mjs --base-url URL --browser brave|chromium|webkit|firefox\n' +
          '  [--asset <assetId>[,<assetId>]]  explicit flat/nested asset id(s) to bake\n' +
          '  [--scenario-frames]              bake EVERY nested fixtures/golden/scenarios/**/*.frames.json placeholder\n' +
          '  [--headless]                     run the browser headless (default: headed, for the human flow)\n' +
          '  [--force]                        refill goldens already marked filled',
      );
      process.exit(0);
    default:
      console.error(`frame-bake.mjs: unknown arg '${a}'`);
      process.exit(2);
  }
}

// --scenario-frames: enumerate the nested placeholders from disk and hand them to the browser as
// explicit ids (the page cannot list dirs). Merge with any explicit --asset ids, de-duplicated.
if (opts.scenarioFrames) {
  const discovered = listScenarioFrameAssetIds(ROOT);
  const merged = new Set([...opts.assetIds, ...discovered]);
  opts.assetIds = [...merged];
  console.log(`[frame-bake] --scenario-frames: discovered ${discovered.length} nested *.frames.json placeholder(s)`);
}

if (opts.assetIds.length === 0) {
  console.error(
    opts.scenarioFrames
      ? 'frame-bake.mjs: --scenario-frames found no fixtures/golden/scenarios/**/*.frames.json (run `bun fixtures/bake-scenario-goldens.mjs --frames` first)'
      : 'frame-bake.mjs: pass at least one --asset <assetId> (or --scenario-frames)',
  );
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
const launchOpts = { headless: opts.headless };
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
    // Allow NESTED but safe relative golden keys (scenarios/<fam>/<name>/NN.ext.frames.json) while still
    // rejecting anything that could escape outDir: absolute paths, backslashes, empty/'.'/'..' segments,
    // non-.json targets, or a key that resolves outside fixtures/golden. (Was: basename(rel)===rel, which
    // rejected every slashed key and blocked the nested real corpus.)
    const outPath = resolve(outDir, rel);
    const within = outPath === outDir || outPath.startsWith(outDir + sep);
    const segments = rel.split('/');
    const unsafe =
      isAbsolute(rel) ||
      rel.includes('\\') ||
      segments.some((s) => s === '' || s === '.' || s === '..') ||
      !rel.endsWith('.json') ||
      !within;
    if (unsafe) {
      throw new Error(`refusing unsafe golden write path '${rel}'`);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    written++;
  }

  // Honesty prune: an asset that did NOT fully bake (partial/failed/skipped) ships NO ssim.json — the
  // producer omits it, but a STALE one from a prior (unfaithful) bake would linger. loadGolden reads
  // ssim.json independently of the frames `pending` flag, so a stale ssim would keep ssim-psnr scoring a
  // FAIL instead of the NA a pending frames golden intends (runner.ts decodeFrameGoldenGap needs BOTH
  // frames AND ssim absent). Remove it so an unfaithful-decode asset resolves to an honest NA_ASSET.
  let prunedSsim = 0;
  for (const asset of report.assets ?? []) {
    // Prune ONLY for an asset we ATTEMPTED but could not fully bake (partial/failed): its frames golden
    // is pending, so any co-located ssim.json is stale and must go. NEVER prune 'filled' (freshly
    // complete) or 'skipped' (already-baked-complete, or asset absent) — those keep their valid ssim.
    if ((asset.status !== 'partial' && asset.status !== 'failed') || !asset.ssimFile) continue;
    const ssimPath = resolve(outDir, asset.ssimFile);
    if ((ssimPath === outDir || ssimPath.startsWith(outDir + sep)) && existsSync(ssimPath)) {
      rmSync(ssimPath, { force: true });
      prunedSsim++;
    }
  }

  console.log(
    `[frame-bake] summary filled:${report.summary.filled} partial:${report.summary.partial} ` +
      `failed:${report.summary.failed} skipped:${report.summary.skipped}; wrote ${written} file(s), pruned ${prunedSsim} stale ssim`,
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
