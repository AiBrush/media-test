#!/usr/bin/env bun
/**
 * Measure the files that a production Vite build actually emits for each engine.
 *
 * The previous producer bundled a synthetic package import and listed WASM/workers/codec cores as
 * exclusions.  That makes a thin wrapper look artificially cheap.  This producer instead walks the
 * production manifest from the engine's real lazy entry, follows its emitted import graph and asset
 * references, adds separately copied runtime files (ffmpeg.wasm), and publishes four disjoint
 * transfer components plus their sum.  `compressedBytes` remains the reporting subsystem's ranked
 * field, but now means the complete transfer total rather than JavaScript alone.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalContentHash,
  createBundleMeasurementsArtifact,
  stablePrettyJson,
} from '../src/core/report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GZIP_LEVEL = 9;
const COMPONENT_KINDS = [
  'javascript-minified-gzip',
  'runtime-wasm',
  'worker',
  'codec-core',
];
const ENGINES = [
  engine(
    'mediabunny@1.48.0',
    '1.48.0',
    'mediabunny',
    'src/engines/mediabunny/adapter.ts',
    (manifest) => findByDynamicImport(manifest, 'node_modules/mediabunny/'),
  ),
  engine(
    'mp4box@2.3.0',
    '2.3.0',
    'mp4box',
    'src/engines/mp4box/adapter.ts',
    (manifest) => exactEntry(manifest, 'src/engines/mp4box/adapter.ts'),
  ),
  engine(
    'web-demuxer@4.0.0',
    '4.0.0',
    'web-demuxer',
    'src/engines/web-demuxer/adapter.ts',
    (manifest) => exactEntry(manifest, 'src/engines/web-demuxer/adapter.ts'),
  ),
  engine(
    'remotion@4.0.479',
    '4.0.479',
    'remotion',
    'src/engines/remotion/adapter.ts',
    (manifest) => findByDynamicImport(manifest, 'node_modules/@remotion/webcodecs/'),
  ),
  engine(
    'ffmpeg.wasm@0.12.15',
    '0.12.15',
    'ffmpeg.wasm',
    'src/engines/ffmpeg-wasm/adapter.ts',
    (manifest) => exactEntry(manifest, 'src/engines/ffmpeg-wasm/register.ts'),
    [
      'vendor/ffmpeg-wasm/core/ffmpeg-core.js',
      'vendor/ffmpeg-wasm/core/ffmpeg-core.wasm',
    ],
  ),
  engine(
    'platform',
    'browser-runtime',
    'platform',
    'src/engines/platform/adapter.ts',
    (manifest) => exactEntry(manifest, 'src/engines/platform/adapter.ts'),
  ),
  engine(
    'aibrush-media@dev',
    'dev',
    'aibrush-media',
    'src/engines/aibrush-media/adapter.ts',
    (manifest) => exactEntry(manifest, 'src/engines/aibrush-media/adapter.ts'),
  ),
];

const options = parseArgs(process.argv.slice(2));
if (typeof Bun === 'undefined') fail('this producer requires Bun');
const selected = options.only
  ? ENGINES.filter((entry) => options.only.includes(entry.engineId) || options.only.includes(entry.aliases[0]))
  : ENGINES;
if (selected.length === 0) fail('--only did not match any configured engine', 2);

const distRoot = resolve(ROOT, options.dist);
const manifestPath = resolve(distRoot, '.vite/manifest.json');
if (!existsSync(manifestPath)) {
  fail(`production manifest not found at ${relative(ROOT, manifestPath)}; run 'bun run build' first`);
}
const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
const viteVersion = packageVersion('vite');
const measurementDefinition = {
  bundler: { name: 'vite', version: viteVersion },
  runtime: { name: 'bun', version: Bun.version },
  target: 'browser-production-artifacts',
  treeShake: true,
  minify: true,
  flags: ['format=esm', 'manifest=true', 'runtime-components=included'],
  byteUnit: 'byte',
  compression: { algorithm: 'gzip', options: { level: GZIP_LEVEL } },
};
const toolchainContentHash = canonicalContentHash(measurementDefinition);
const measurements = [];
for (const entry of selected) {
  const source = sourceRecord(entry);
  try {
    const measured = measureProductionEntry(entry, manifest, distRoot, toolchainContentHash);
    measurements.push({
      state: 'MEASURED',
      engineId: entry.engineId,
      engineVersion: entry.engineVersion,
      aliases: entry.aliases,
      source,
      rawBytes: measured.rawBytes,
      compressedBytes: measured.transferTotalBytes,
      includedFiles: measured.includedFiles,
      excludedRuntimeAssets: [],
      sourceContentHash: source.contentHash,
      toolchainContentHash,
      components: measured.components,
      transferTotalBytes: measured.transferTotalBytes,
    });
    if (!options.json) {
      const componentText = measured.components
        .map((component) => `${component.kind}=${component.transferBytes}`)
        .join(', ');
      console.log(
        `[bundle] ${entry.engineId.padEnd(30)} ${String(measured.transferTotalBytes).padStart(10)} transfer bytes `
        + `(${componentText})`,
      );
    }
  } catch (error) {
    const reason = describe(error);
    measurements.push({
      state: 'UNAVAILABLE',
      engineId: entry.engineId,
      engineVersion: entry.engineVersion,
      aliases: entry.aliases,
      source,
      reasonCode: 'BUNDLE_BUILD_ARTIFACTS_UNAVAILABLE',
      reason,
      sourceContentHash: source.contentHash,
      toolchainContentHash,
    });
    if (!options.json) console.error(`[bundle] ${entry.engineId}: UNAVAILABLE — ${reason}`);
  }
}

// REP-17 validates and hashes the stable reporting projection. Component maps are additive fields
// permitted by that schema; retain them in the serialized evidence while keeping the canonical hash
// compatible with existing readers. The ranked `compressedBytes` is already the complete total.
const reportingMeasurements = measurements.map(stripComponentExtension);
const validated = createBundleMeasurementsArtifact({
  artifactId: `bundle-${canonicalContentHash({ measurementDefinition, engines: selected.map((entry) => entry.engineId) }).slice(0, 24)}`,
  measurementDefinition,
  measurements: reportingMeasurements,
});
const artifact = { ...validated, measurements };
const output = resolve(ROOT, options.out);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, stablePrettyJson(artifact));
if (options.json) process.stdout.write(stablePrettyJson(artifact));
else console.log(`[bundle] wrote ${relative(ROOT, output)} · ${artifact.contentHash}`);

function measureProductionEntry(entry, productionManifest, productionRoot, toolchainHash) {
  const start = entry.findManifestEntry(productionManifest);
  if (!start) throw new Error(`manifest has no production entry for ${entry.adapterEntry}`);
  const paths = collectManifestFiles(productionManifest, start.key);
  for (const extra of entry.runtimeFiles) paths.add(extra);
  discoverAbsoluteRuntimeAssets(paths, productionRoot);

  const files = [...paths].sort().map((path) => measureFile(path, productionRoot));
  if (files.length === 0) throw new Error('production entry emitted no measurable files');
  const components = COMPONENT_KINDS.map((kind) => {
    const selectedFiles = files.filter((file) => classifyComponent(file.path) === kind);
    return {
      kind,
      rawBytes: selectedFiles.reduce((sum, file) => sum + file.rawBytes, 0),
      transferBytes: selectedFiles.reduce((sum, file) => sum + file.transferBytes, 0),
      files: selectedFiles.map(({ path, sha256, rawBytes, transferBytes }) => ({
        path,
        sha256,
        rawBytes,
        transferBytes,
      })),
      compression: { algorithm: 'gzip', options: { level: GZIP_LEVEL } },
    };
  });
  const transferTotalBytes = components.reduce((sum, component) => sum + component.transferBytes, 0);
  return {
    rawBytes: files.reduce((sum, file) => sum + file.rawBytes, 0),
    transferTotalBytes,
    includedFiles: files.map((file) => file.path),
    sourceContentHash: sourceRecord(entry).contentHash,
    toolchainContentHash: toolchainHash,
    components,
  };
}

function collectManifestFiles(productionManifest, startKey) {
  const files = new Set();
  const seen = new Set();
  const queue = [startKey];
  while (queue.length > 0) {
    const key = queue.shift();
    if (!key || key === 'index.html' || seen.has(key)) continue;
    seen.add(key);
    const record = productionManifest[key];
    if (!record) throw new Error(`manifest dependency '${key}' is absent`);
    if (record.file) files.add(normalizeArtifactPath(record.file));
    for (const asset of record.assets ?? []) files.add(normalizeArtifactPath(asset));
    for (const dependency of [...(record.imports ?? []), ...(record.dynamicImports ?? [])]) {
      if (dependency !== 'index.html') queue.push(dependency);
    }
  }
  return files;
}

/** Vite rewrites Worker URLs into absolute /assets/... strings that are not always manifest edges. */
function discoverAbsoluteRuntimeAssets(paths, productionRoot) {
  const queue = [...paths];
  const visited = new Set();
  while (queue.length > 0) {
    const path = queue.shift();
    if (!path || visited.has(path) || extname(path) !== '.js') continue;
    visited.add(path);
    const absolute = resolve(productionRoot, path);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(/["'`](\/assets\/[A-Za-z0-9._/-]+)["'`]/g)) {
      const referenced = normalizeArtifactPath(match[1]);
      if (!paths.has(referenced) && existsSync(resolve(productionRoot, referenced))) {
        paths.add(referenced);
        queue.push(referenced);
      }
    }
  }
}

function measureFile(path, productionRoot) {
  const absolute = resolve(productionRoot, path);
  if (!existsSync(absolute)) throw new Error(`emitted runtime file '${path}' is missing from dist`);
  const bytes = new Uint8Array(readFileSync(absolute));
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    rawBytes: bytes.byteLength,
    transferBytes: Bun.gzipSync(bytes, { level: GZIP_LEVEL }).byteLength,
  };
}

function classifyComponent(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.wasm')) return 'runtime-wasm';
  if (/(?:^|[/.\-_])worker(?:[/.\-_]|$)/.test(lower)) return 'worker';
  if (/(?:^|[/.\-_])(?:codec-)?core(?:[/.\-_]|$)/.test(lower) || /ffmpeg-core\.js$/.test(lower)) {
    return 'codec-core';
  }
  return 'javascript-minified-gzip';
}

function exactEntry(manifest, key) {
  const record = manifest[key];
  return record ? { key, record } : undefined;
}

function findByDynamicImport(manifest, prefix) {
  const matches = Object.entries(manifest).filter(([, record]) =>
    (record.dynamicImports ?? []).some((dependency) => dependency.startsWith(prefix)));
  if (matches.length !== 1) {
    throw new Error(`expected one manifest entry importing '${prefix}', found ${matches.length}`);
  }
  return { key: matches[0][0], record: matches[0][1] };
}

function parseManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('production Vite manifest must be an object');
  }
  return value;
}

function stripComponentExtension(measurement) {
  if (measurement.state === 'UNAVAILABLE') {
    const { sourceContentHash: _sourceContentHash, toolchainContentHash: _toolchainContentHash, ...base } = measurement;
    return base;
  }
  const {
    sourceContentHash: _sourceContentHash,
    toolchainContentHash: _toolchainContentHash,
    components: _components,
    transferTotalBytes: _transferTotalBytes,
    ...base
  } = measurement;
  return base;
}

function sourceRecord(entry) {
  const adapterSource = readFileSync(resolve(ROOT, entry.adapterEntry), 'utf8');
  return {
    entry: entry.adapterEntry,
    imports: [],
    contentHash: canonicalContentHash({
      schema: 'media-test/bundle-source@2-production-entry',
      entry: entry.adapterEntry,
      adapterSource,
    }),
  };
}

function engine(engineId, engineVersion, alias, adapterEntry, findManifestEntry, runtimeFiles = []) {
  return {
    engineId,
    engineVersion,
    aliases: alias ? [alias] : [],
    adapterEntry,
    findManifestEntry,
    runtimeFiles,
  };
}

function packageVersion(name) {
  const value = JSON.parse(readFileSync(resolve(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error(`${name} package version is unavailable`);
  }
  return value.version;
}

function parseArgs(argv) {
  const options = { out: 'results/bundle-measurements.json', dist: 'dist', only: undefined, json: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--out') options.out = requiredArg(argv, ++index, value);
    else if (value === '--dist') options.dist = requiredArg(argv, ++index, value);
    else if (value === '--only') {
      options.only = requiredArg(argv, ++index, value).split(',').map((entry) => entry.trim()).filter(Boolean);
    } else if (value === '--json') options.json = true;
    else if (value === '-h' || value === '--help') {
      console.log(
        'bun scripts/measure-bundles.mjs [--dist dist] [--out results/bundle-measurements.json] '
        + '[--only id,id] [--json]',
      );
      process.exit(0);
    } else fail(`unknown argument '${value}'`, 2);
  }
  return options;
}

function normalizeArtifactPath(value) {
  const normalized = String(value).replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`invalid emitted artifact path '${value}'`);
  }
  return normalized;
}

function requiredArg(values, index, flag) {
  const value = values[index];
  if (!value) fail(`${flag} requires a value`, 2);
  return value;
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message, code = 1) {
  console.error(`measure-bundles.mjs: ${message}`);
  process.exit(code);
}
