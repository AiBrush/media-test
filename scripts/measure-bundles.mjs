/**
 * scripts/measure-bundles.mjs — OFFLINE, per-engine "shipped JS cost" measurement (§8.1 / §A.14).
 *
 * This is the build-time half of the headline `performance/bundle-size` case. It is run OFFLINE
 * (never at run time, never in the browser) and writes a single map of engineId → kBytes that the
 * suite later injects as MetricSample.bundleSizeKb. It does NO media work and reads NO corpus asset.
 *
 * WHAT IT MEASURES
 *   For each engine entrypoint it synthesizes a tiny ESM entry that imports exactly the library
 *   surface the engine's adapter imports (the real shipped surface — same specifiers as
 *   src/engines/<engine>/adapter.ts), then bundles + tree-shakes + minifies it for the browser and
 *   gzips the result. The reported number is gzip(min(bundle)) in kB (1 kB = 1024 bytes), rounded to
 *   one decimal — the apples-to-apples "what each library costs to ship" number, matching how
 *   Mediabunny publishes its own bundle-size chart (min + gzip).
 *
 *   Excluded from the JS number (by design, documented per engine below):
 *     - WASM binaries / Workers loaded at RUN TIME as separate assets (ffmpeg-core.wasm,
 *       web-demuxer's .wasm, etc.). Those are NOT shipped JS; folding them into the JS bundle-size
 *       metric would be dishonest. They are listed in `notes` so the report can surface them.
 *     - The `platform` engine ships NO third-party library at all (pure WebCodecs/DOM glue), so its
 *       shipped-library cost is 0 kB — recorded honestly as 0, not omitted.
 *
 * HOW THE SUITE READS THIS MAP (the contract — keep in sync with src/scenarios/performance/index.ts)
 *   Output: results/bundle-sizes.json  ::  { "<engineId>": <kBytes:number>, ... }
 *   The keys are MediaEngine.id values (e.g. "mediabunny@1.48.0", "mp4box@2.3.0"). The
 *   `performance/bundle-size` scenario is modeled as a normal Scenario whose primaryMetric is
 *   'bundleSize'. At report-assembly time the suite/runner:
 *     1. reads results/bundle-sizes.json,
 *     2. for each (engine) cell of performance/bundle-size, looks up the engine's id in the map,
 *     3. injects the value into MetricSample.bundleSizeKb (the field scenario.ts reserves for
 *        "set from the offline per-engine build, not measured at run time"),
 *     4. the report ranks engines by primaryMetric=bundleSize (lower-is-better) like any other case.
 *   A missing/zero entry is an honest FAIL/NA for that cell — never a fabricated number. The map also
 *   carries an alias for each engine's bare registration id (e.g. "mediabunny", "mp4box") so the
 *   join still works whether the suite keys by MediaEngine.id or by the registry id.
 *
 * ── TODO (ORCHESTRATOR / runner+app wiring — NOT owned by src/scenarios/performance/index.ts) ──────
 * The scenario side (oracle=golden-metadata, op=probe, input=tiny_h264_360p_2s.mp4, metric=bundleSize)
 * is done. Two small reads remain, in files the scenario author may not edit:
 *   [APP]    src/app/main.ts boot(): fetch this file once and stash it on a global the runner reads:
 *              try { window.__BUNDLE_SIZES__ = await (await fetch('results/bundle-sizes.json')).json(); }
 *              catch { window.__BUNDLE_SIZES__ = {}; }   // absent ⇒ honest FAIL/NA, never fabricated
 *            (declare `__BUNDLE_SIZES__?: Record<string, number>` on the Window interface there.)
 *   [RUNNER] src/core/runner.ts runBench() sample closure: for the bundle-size cell, inject the size:
 *              if (scenario.id === 'performance/bundle-size') {
 *                const m = (globalThis).__BUNDLE_SIZES__ ?? {};
 *                const kb = m[engine.id] ?? m[bareRegistryId];   // bareRegistryId = the alias key
 *                if (typeof kb === 'number' && Number.isFinite(kb)) sample.bundleSizeKb = kb;
 *              }
 *            bench() already maps metric 'bundleSize' → MetricSample.bundleSizeKb (src/core/bench.ts
 *            METRIC_FIELD) and report.ts engineBundleSizeKb() already reads bench.bundleSize.median, so
 *            no other change is needed. A missing key ⇒ NaN ⇒ n=0 ⇒ no number (honest FAIL/NA).
 *
 * RUNTIME: bun-only. Uses Bun.build (Bun's bundler) + Bun.gzipSync — no node, no network, no CDN.
 *   esbuild@0.21.5 is also present in node_modules and is used as a documented fallback bundler if
 *   Bun.build is ever unavailable (kept identical flags: browser target, esm, minify, bundle).
 *
 *   Run:   bun scripts/measure-bundles.mjs [--out results/bundle-sizes.json] [--only <id,id>] [--json]
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── engine entrypoint table ──────────────────────────────────────────────────────────────────────
// `id`     : the MediaEngine.id the suite keys by (must match src/engines/<engine>/adapter.ts). This
//            is the EXACT key the results carry (e.g. 'mediabunny@1.48.0', 'platform@chrome-149'), so
//            the report-time join in scripts/compare.mjs hits on the engine id with no remapping.
// `alias`  : the bare registry id (registerEngine(...)) — emitted as a second key so the join is
//            robust to whichever id the suite uses.
// `aliases`: optional EXTRA keys emitted with the same kB value. Used for engines whose runtime id is
//            navigator-derived and therefore not a single fixed string — `platform` derives
//            'platform@<family>-<major>' from the UA at run time (platform/adapter.ts deriveId()), so
//            we emit the common variants here AND compare.mjs falls back to a 'platform@*' prefix match
//            so any browser/version still joins to the 0 kB shipped-library cost.
// `imports`: the library specifiers the adapter actually imports (the real shipped surface). An empty
//            list means the engine ships no third-party library (cost 0 kB).
// `entry`  : optional explicit entry source; defaults to re-exporting everything from `imports`.
// `note`   : run-time-only assets excluded from the JS number, surfaced for the report.
const ENGINES = [
  {
    id: 'mediabunny@1.48.0',
    alias: 'mediabunny',
    imports: ['mediabunny'],
    note: 'Pure-JS/TS library; no separate WASM/Worker asset. Full shipped JS cost.',
  },
  {
    id: 'mp4box@2.3.0',
    alias: 'mp4box',
    imports: ['mp4box'],
    note: 'Pure-JS demux/mux library; no separate WASM. Full shipped JS cost.',
  },
  {
    id: 'web-demuxer@4.0.0',
    alias: 'web-demuxer',
    imports: ['web-demuxer'],
    note: 'JS wrapper bundled here; the FFmpeg-based .wasm is a RUN-TIME asset loaded separately and is excluded from the shipped-JS number.',
  },
  {
    id: 'remotion-media-parser@4.0.479',
    alias: 'remotion-media-parser',
    imports: ['@remotion/media-parser', '@remotion/media-parser/web'],
    note: 'Pure-TS, zero-dependency parser. The optional /worker entry is loaded lazily at run time and is excluded.',
  },
  {
    id: 'remotion-webcodecs@4.0.479',
    alias: 'remotion-webcodecs',
    imports: ['@remotion/webcodecs', '@remotion/webcodecs/buffer'],
    note: 'WebCodecs-based; the optional /worker entry is loaded lazily at run time and is excluded.',
  },
  {
    id: 'ffmpeg.wasm@0.12.15',
    alias: 'ffmpeg.wasm',
    imports: ['@ffmpeg/ffmpeg'],
    note: 'Only the @ffmpeg/ffmpeg JS WRAPPER is shipped JS. ffmpeg-core.js/.wasm/.worker.js (the multi-MB core) load at RUN TIME from the local vendor dir and are EXCLUDED from the shipped-JS number (they are runtime assets, not bundled JS).',
  },
  {
    // The platform engine's runtime id is navigator-derived (platform/adapter.ts deriveId() →
    // 'platform@<family>-<major>', e.g. the Chrome run records 'platform@chrome-149'). There is no
    // fixed version, so we make that the canonical key (matching what results carry) and emit the bare
    // 'platform' + common browser variants as aliases; compare.mjs additionally does a 'platform@*'
    // prefix fallback so ANY browser/version joins to this 0 kB cost.
    id: 'platform@chrome-149',
    alias: 'platform',
    aliases: ['platform@chrome', 'platform@firefox', 'platform@webkit', 'platform@safari', 'platform@browser'],
    imports: [], // ships NO third-party library — pure WebCodecs/MSE/DOM glue
    note: 'No third-party library shipped (uses built-in WebCodecs/<video>/MediaRecorder). Shipped-library cost is 0 kB by construction. The engine id is navigator-derived (platform@<family>-<major>); compare.mjs falls back to a platform@* prefix match so every browser variant joins.',
  },
  {
    // PLACEHOLDER / stub engine (src/engines/aibrush-media/adapter.ts): pure local TypeScript that
    // imports NO third-party library and ships "no run-time bytes of any kind" (no package, no
    // WASM/Worker/CDN). Its honest shipped-library cost is therefore 0 kB by construction, exactly like
    // `platform`. Recorded so all 8 engine ids the results carry are present in the map (the cell is
    // NA(engine) today because the stub declares no operations, so it never actually ranks).
    id: 'aibrush-media@dev',
    alias: 'aibrush-media',
    imports: [],
    note: 'Placeholder/stub adapter — pure local TypeScript, imports no third-party library and ships no run-time bytes (no package/WASM/Worker/CDN). Shipped-library cost is 0 kB by construction. Currently NA(engine) (declares no operations), so this cell does not rank; the id is emitted so the bundle-size map covers all 8 engine ids.',
  },
];

// ── args ───────────────────────────────────────────────────────────────────────────────────────
const opts = { out: 'results/bundle-sizes.json', only: null, json: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') opts.out = argv[++i];
  else if (a === '--only') opts.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--json') opts.json = true;
  else if (a === '-h' || a === '--help') {
    console.log('bun scripts/measure-bundles.mjs [--out results/bundle-sizes.json] [--only <id,id>] [--json]');
    process.exit(0);
  } else {
    console.error(`measure-bundles.mjs: unknown arg '${a}'`);
    process.exit(2);
  }
}

if (typeof Bun === 'undefined') {
  console.error('measure-bundles.mjs is bun-only. Run it with: bun scripts/measure-bundles.mjs');
  process.exit(1);
}

const KB = 1024;
const kb = (bytes) => Math.round((bytes / KB) * 10) / 10;

// Build one engine's synthetic entry, bundle+minify it (browser/esm), gzip, return { bytes, error }.
async function measure(engine, tmpDir) {
  // No library ⇒ 0 kB shipped cost (honest, not omitted).
  if (!engine.imports || engine.imports.length === 0) {
    return { rawBytes: 0, gzipBytes: 0 };
  }

  // Synthesize an entry that imports + re-exports each library surface, so nothing is tree-shaken
  // away as "unused" — we want the cost of the surface the adapter actually pulls in.
  const lines = engine.imports.map((spec, i) => `import * as _m${i} from ${JSON.stringify(spec)};`);
  const refs = engine.imports.map((_, i) => `_m${i}`).join(', ');
  // globalThis sink keeps the imports live under aggressive minification/DCE.
  const entrySrc = `${lines.join('\n')}\nglobalThis.__sizeProbe = [${refs}];\n`;
  const entryPath = join(tmpDir, `${sanitize(engine.id)}.entry.mjs`);
  writeFileSync(entryPath, entrySrc);

  // PRIMARY bundler: Bun.build (Bun's native bundler). Browser target, minified, tree-shaken.
  try {
    const result = await Bun.build({
      entrypoints: [entryPath],
      target: 'browser',
      format: 'esm',
      minify: true,
      sourcemap: 'none',
      // The wasm core / worker assets are runtime-loaded; if any specifier pulls a .wasm import it is
      // left external (we only want the shipped JS). Node built-ins are externalized defensively.
      external: ['*.wasm'],
    });
    if (!result.success) {
      const msg = result.logs?.map((l) => l.message).join('; ') || 'Bun.build failed';
      // Fall back to esbuild rather than failing outright.
      return await measureWithEsbuild(engine, entryPath).catch(() => ({ error: msg }));
    }
    let raw = 0;
    let gz = 0;
    for (const out of result.outputs) {
      if (out.kind !== 'entry-point' && out.kind !== 'chunk') continue;
      const bytes = new Uint8Array(await out.arrayBuffer());
      raw += bytes.byteLength;
      gz += Bun.gzipSync(bytes).byteLength;
    }
    return { rawBytes: raw, gzipBytes: gz };
  } catch (e) {
    // Bun.build unavailable/threw — documented fallback path.
    return await measureWithEsbuild(engine, entryPath).catch(() => ({ error: describe(e) }));
  }
}

// Documented fallback: esbuild@0.21.5 (present in node_modules), identical intent/flags to Bun.build.
async function measureWithEsbuild(engine, entryPath) {
  const esbuild = await import('esbuild');
  const res = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    sourcemap: false,
    legalComments: 'none',
    external: ['*.wasm'],
    logLevel: 'silent',
  });
  let raw = 0;
  let gz = 0;
  for (const f of res.outputFiles) {
    raw += f.contents.byteLength;
    gz += Bun.gzipSync(f.contents).byteLength;
  }
  return { rawBytes: raw, gzipBytes: gz };
}

function sanitize(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}
function describe(e) {
  return e instanceof Error ? e.message : String(e);
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
const selected = opts.only
  ? ENGINES.filter((e) => opts.only.includes(e.id) || opts.only.includes(e.alias))
  : ENGINES;

const tmpDir = join(ROOT, '.bundle-tmp');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

/** @type {Record<string, number>} engineId → kBytes (gzip+min). */
const sizes = {};
/** Diagnostic detail, written alongside for transparency (never read by the join). */
const detail = {};

for (const engine of selected) {
  const r = await measure(engine, tmpDir);
  if (r.error) {
    console.error(`[bundle] ${engine.id}: ERROR — ${r.error} (omitted from map ⇒ honest FAIL/NA in report)`);
    detail[engine.id] = { error: r.error, note: engine.note };
    continue;
  }
  const k = kb(r.gzipBytes);
  sizes[engine.id] = k;
  // Robust join keys: the bare registry alias + any extra navigator-derived id variants, all sharing
  // the same kB. (compare.mjs additionally does a prefix fallback for variant ids it doesn't find.)
  for (const a of [engine.alias, ...(engine.aliases ?? [])]) {
    if (a && a !== engine.id) sizes[a] = k;
  }
  detail[engine.id] = {
    kBytesGzip: k,
    kBytesRaw: kb(r.rawBytes),
    imports: engine.imports,
    note: engine.note,
  };
  console.log(`[bundle] ${engine.id.padEnd(32)} ${String(k).padStart(8)} kB (min+gzip)  raw ${kb(r.rawBytes)} kB`);
}

rmSync(tmpDir, { recursive: true, force: true });

const outPath = resolve(ROOT, opts.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(sizes, null, 2) + '\n');
// Sibling detail file (transparency only; the suite reads bundle-sizes.json).
writeFileSync(outPath.replace(/\.json$/, '.detail.json'), JSON.stringify(detail, null, 2) + '\n');

console.log(`\n[bundle] wrote ${opts.out} (${Object.keys(sizes).length} keys) + ${opts.out.replace(/\.json$/, '.detail.json')}`);
if (opts.json) console.log(JSON.stringify(sizes, null, 2));
