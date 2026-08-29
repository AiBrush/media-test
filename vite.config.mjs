// vite.config.mjs — dev/build config for the suite app.
//
// The one job here that MATTERS: serve fixtures/** as RAW static bytes (with HTTP Range support)
// BEFORE vite's module transform. Without this, a media fixture like fixtures/media/h264_ts.ts is
// intercepted by vite as a TypeScript module (→ 500), so MPEG-TS / any .ts-named asset can't be
// fetched. The runner relies on Range (MediaInput contract + source-reads metric), so we honor it.
//
// Runtime: bun (`bunx vite` / `bun x vite`). No node CLI anywhere.

import { createHash, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

const MIME = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.ts': 'video/mp2t', // MPEG-TS — NOT TypeScript
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.caf': 'audio/x-caf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.key': 'application/octet-stream', // HLS AES-128 key
};

/** Resolve the explicit MIME policy shared by every raw static-file boundary. */
export function staticContentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function parseByteRange(range, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  if (!m) return null;

  const startRaw = m[1];
  const endRaw = m[2];
  if (!startRaw && !endRaw) return null;

  let start;
  let end;
  if (!startRaw) {
    const suffix = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end >= size) end = size - 1;
  if (start > end || start >= size) return { unsatisfiable: true };
  return { start, end };
}

function streamStaticFile(req, res, filePath, st, type, corp) {
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', corp);
  res.setHeader('Cache-Control', 'no-store');

  const range = req.headers['range'];
  const parsed = range ? parseByteRange(range, st.size) : null;
  if (parsed?.unsatisfiable) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${st.size}`);
    return res.end();
  }

  if (st.size === 0) {
    res.statusCode = range ? 416 : 200;
    if (range) res.setHeader('Content-Range', 'bytes */0');
    res.setHeader('Content-Length', '0');
    return res.end();
  }

  const start = parsed ? parsed.start : 0;
  const end = parsed ? parsed.end : st.size - 1;
  if (parsed) {
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
  } else {
    res.statusCode = 200;
    res.setHeader('Content-Length', String(st.size));
  }

  if (req.method === 'HEAD') return res.end();

  const stream = createReadStream(filePath, { start, end });
  req.on('close', () => {
    if (!res.writableEnded) stream.destroy();
  });
  stream.on('error', (err) => {
    if (res.destroyed || err?.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
    if (!res.headersSent) res.statusCode = 500;
    res.end(`static stream error: ${err?.message || err}`);
  });
  stream.pipe(res);
}

/** Serve /fixtures/** raw, with Range support, ahead of vite's transform pipeline. */
function fixturesStatic() {
  const fixturesRoot = join(process.cwd(), 'fixtures');
  return {
    name: 'fixtures-static',
    // Added in configureServer directly (not in a returned post-hook) so it runs BEFORE vite's
    // internal module-transform middlewares — that is what lets *.ts media bypass TS handling.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith('/fixtures/')) return next();

        const filePath = normalize(join(process.cwd(), decodeURIComponent(url)));
        // path traversal guard: must stay under fixtures/
        if (!filePath.startsWith(fixturesRoot) || !existsSync(filePath)) {
          res.statusCode = 404;
          return res.end('fixtures: not found');
        }
        const st = statSync(filePath);
        if (st.isDirectory()) {
          res.statusCode = 404;
          return res.end('fixtures: is a directory');
        }

        const type = staticContentType(filePath);
        // Under COEP: require-corp, every subresource needs a CORP header to be loadable.
        return streamStaticFile(req, res, filePath, st, type, 'cross-origin');
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith('/fixtures/')) return next();

        const filePath = normalize(join(process.cwd(), decodeURIComponent(url)));
        if (!filePath.startsWith(fixturesRoot) || !existsSync(filePath)) {
          res.statusCode = 404;
          return res.end('fixtures: not found');
        }
        const st = statSync(filePath);
        if (st.isDirectory()) {
          res.statusCode = 404;
          return res.end('fixtures: is a directory');
        }

        const type = staticContentType(filePath);
        return streamStaticFile(req, res, filePath, st, type, 'cross-origin');
      });
    },
  };
}

const CONTENT_ATTESTATION_PATH = '/__media_test__/content-attestation';
const CONTENT_ATTESTATION_CHUNK_BYTES = 1024 * 1024;

function fixtureFileVersion(st) {
  return [st.dev, st.ino, st.mode, st.size, st.mtimeMs, st.ctimeMs].join(':');
}

export async function hashFixtureBlocks(filePath) {
  const before = statSync(filePath);
  const overall = createHash('sha256');
  let block = createHash('sha256');
  let blockBytes = 0;
  let actualSizeBytes = 0;
  const chunkSha256 = [];
  for await (const value of createReadStream(filePath, {
    highWaterMark: CONTENT_ATTESTATION_CHUNK_BYTES,
  })) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    overall.update(bytes);
    actualSizeBytes += bytes.byteLength;
    let offset = 0;
    while (offset < bytes.byteLength) {
      const take = Math.min(CONTENT_ATTESTATION_CHUNK_BYTES - blockBytes, bytes.byteLength - offset);
      block.update(bytes.subarray(offset, offset + take));
      blockBytes += take;
      offset += take;
      if (blockBytes === CONTENT_ATTESTATION_CHUNK_BYTES) {
        chunkSha256.push(block.digest('hex'));
        block = createHash('sha256');
        blockBytes = 0;
      }
    }
  }
  if (blockBytes > 0) chunkSha256.push(block.digest('hex'));
  const after = statSync(filePath);
  if (fixtureFileVersion(before) !== fixtureFileVersion(after) || actualSizeBytes !== after.size) {
    throw new Error('fixture changed while its content attestation was being computed');
  }
  return {
    actualSha256: overall.digest('hex'),
    actualSizeBytes,
    chunkSizeBytes: CONTENT_ATTESTATION_CHUNK_BYTES,
    chunkSha256,
  };
}

/** Deduplicate concurrent hashes and reuse them only while the exact file version is unchanged. */
export function createCachedFixtureBlockHasher(hashBlocks = hashFixtureBlocks) {
  const cache = new Map();
  return async (filePath) => {
    const version = fixtureFileVersion(statSync(filePath));
    const existing = cache.get(filePath);
    if (existing?.version === version) return existing.promise;

    const promise = Promise.resolve().then(() => hashBlocks(filePath));
    const entry = { version, promise };
    cache.set(filePath, entry);
    try {
      return await promise;
    } catch (error) {
      if (cache.get(filePath) === entry) cache.delete(filePath);
      throw error;
    }
  };
}

/**
 * Authenticate a large fixture in the local harness process, outside the measured browser heap.
 * The browser still binds the returned full digest to the selected identity and hashes every range
 * the adapter consumes against this block map, preserving the admission + TOCTOU contract.
 */
export function createContentAttestationEndpointHandler() {
  const fixturesMediaRoot = join(process.cwd(), 'fixtures', 'media');
  const hashFixtureBlocksCached = createCachedFixtureBlockHasher();
  return (req, res, next) => {
    const requestUrl = new URL(req.url || '/', 'http://media-test.invalid');
    if (requestUrl.pathname !== CONTENT_ATTESTATION_PATH) return next();
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      return res.end('content-attestation: GET required');
    }
    const logicalPath = requestUrl.searchParams.get('logicalPath');
    if (!logicalPath) {
      res.statusCode = 400;
      return res.end('content-attestation: logicalPath is required');
    }
    const filePath = normalize(resolve(fixturesMediaRoot, logicalPath));
    if (
      !isTrueDescendant(fixturesMediaRoot, filePath) ||
      !existsSync(filePath) ||
      containsExistingSymlink(fixturesMediaRoot, filePath)
    ) {
      res.statusCode = 404;
      return res.end('content-attestation: fixture not found');
    }
    const initial = statSync(filePath);
    if (!initial.isFile()) {
      res.statusCode = 404;
      return res.end('content-attestation: fixture is not a file');
    }
    void hashFixtureBlocksCached(filePath).then(
      (attestation) => {
        if (res.destroyed || res.writableEnded) return;
        const body = JSON.stringify({
          schema: 'media-test/content-attestation@1',
          logicalPath,
          ...attestation,
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Content-Length', String(Buffer.byteLength(body)));
        res.end(body);
      },
      (error) => {
        if (res.destroyed || res.writableEnded) return;
        res.statusCode = 500;
        res.end(`content-attestation: ${error?.message || error}`);
      },
    );
  };
}

function contentAttestationEndpoint() {
  const handler = createContentAttestationEndpointHandler();
  return {
    name: 'fixture-content-attestation',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/**
 * Serve /vendor/ffmpeg-wasm/** raw, ahead of Vite transforms, for Emscripten workers.
 *
 * A checked-out `src/engines/ffmpeg-wasm/vendor` directory is optional (and gitignored). The pinned
 * package assets in node_modules are the primary source, with that directory as a legacy fallback.
 * Keeping the public URL stable matters because Emscripten resolves its wasm/pthread worker relative
 * to the core script.
 */
function ffmpegVendorStatic() {
  const publicPrefix = '/vendor/ffmpeg-wasm/';
  const vendorRoot = join(process.cwd(), 'src', 'engines', 'ffmpeg-wasm', 'vendor');
  const packageRoots = {
    // FFmpeg.load() starts its class worker as `type: module`. That worker falls back from the
    // unavailable importScripts() to dynamic import(coreURL), so coreURL must expose an ESM default
    // export. Serving the UMD build here produces the wrapper's opaque "failed to import" error.
    core: join(process.cwd(), 'node_modules', '@ffmpeg', 'core', 'dist', 'esm'),
    'core-mt': join(process.cwd(), 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'esm'),
  };
  const allowedFiles = new Set(['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']);

  const resolveFile = (rel) => {
    const parts = rel.split('/');
    if (parts.length !== 2 || !Object.hasOwn(packageRoots, parts[0]) || !allowedFiles.has(parts[1])) {
      return null;
    }

    const packaged = join(packageRoots[parts[0]], parts[1]);
    if (existsSync(packaged)) return packaged;

    const vendored = join(vendorRoot, parts[0], parts[1]);
    return existsSync(vendored) ? vendored : null;
  };

  const serve = (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith(publicPrefix)) return next();

    const rel = decodeURIComponent(url.slice(publicPrefix.length));
    const filePath = resolveFile(rel);
    if (!filePath) {
      res.statusCode = 404;
      return res.end('ffmpeg vendor: not found');
    }
    const st = statSync(filePath);
    if (st.isDirectory()) {
      res.statusCode = 404;
      return res.end('ffmpeg vendor: is a directory');
    }

    const type = staticContentType(filePath);
    return streamStaticFile(req, res, filePath, st, type, 'same-origin');
  };

  return {
    name: 'ffmpeg-vendor-static',
    buildStart() {
      for (const rel of ['core/ffmpeg-core.js', 'core/ffmpeg-core.wasm']) {
        if (!resolveFile(rel)) this.error(`Missing ffmpeg.wasm runtime asset: ${rel}. Run bun install.`);
      }
    },
    writeBundle(outputOptions) {
      // Vite's dev/preview middleware serves package assets directly. A standalone dist/ build also
      // needs physical copies because there is no middleware after deployment.
      const outDir = outputOptions.dir;
      if (!outDir) return;
      for (const rel of [
        'core/ffmpeg-core.js',
        'core/ffmpeg-core.wasm',
        'core-mt/ffmpeg-core.js',
        'core-mt/ffmpeg-core.wasm',
        'core-mt/ffmpeg-core.worker.js',
      ]) {
        const source = resolveFile(rel);
        if (!source) continue;
        const target = join(outDir, 'vendor', 'ffmpeg-wasm', rel);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
    },
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}

/**
 * Cross-origin isolation (§8.5): set COOP:same-origin + COEP:require-corp on EVERY dev response so
 * `crossOriginIsolated === true` → SharedArrayBuffer is available (ffmpeg.wasm multi-thread core, any
 * mt-WASM framework) and performance.measureUserAgentSpecificMemory works (precise peak-memory).
 * serve.sh exports VITE_COOP/VITE_COEP; default to the isolating pair. Registered FIRST so the headers
 * are present on the HTML, JS modules, wasm, and workers alike. Without this, mt-WASM init HANGS.
 */
function crossOriginIsolation() {
  const coop = process.env.VITE_COOP || 'same-origin';
  const coep = process.env.VITE_COEP || 'require-corp';
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', coop);
        res.setHeader('Cross-Origin-Embedder-Policy', coep);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', coop);
        res.setHeader('Cross-Origin-Embedder-Policy', coep);
        next();
      });
    },
  };
}

export const SAVE_ENDPOINT_MAX_BYTES = 10 * 1024 * 1024;
const SAVE_ENDPOINT_TOKEN_HEADER = 'x-media-test-save-token';
const SAVE_ENDPOINT_MIN_TOKEN_LENGTH = 32;

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function tokenMatches(actual, expected) {
  const supplied = Buffer.from(String(actual || ''), 'utf8');
  const configured = Buffer.from(String(expected || ''), 'utf8');
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

function isTrueDescendant(root, candidate) {
  const child = relative(root, candidate);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function containsExistingSymlink(root, candidate) {
  try {
    if (existsSync(root) && lstatSync(root).isSymbolicLink()) return true;
    let cursor = root;
    for (const part of relative(root, candidate).split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) return true;
    }
    return false;
  } catch {
    // A path component that cannot be inspected is not a safe write target.
    return true;
  }
}

function sameRequestOrigin(origin, host) {
  if (!origin) return true;
  if (!host) return false;
  try {
    const parsed = new URL(String(origin));
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === String(host);
  } catch {
    return false;
  }
}

/**
 * Validate the optional development-only save surface without reading the body. Exported so the
 * containment/authentication policy can be exercised without starting Vite.
 */
export function inspectSaveRequest({
  enabled = false,
  token = '',
  method = 'GET',
  url = '/',
  headers = {},
  cwd = process.cwd(),
  maxBytes = SAVE_ENDPOINT_MAX_BYTES,
} = {}) {
  if (!enabled) return { ok: false, status: 404, message: 'save: disabled' };
  if (String(token).length < SAVE_ENDPOINT_MIN_TOKEN_LENGTH) {
    return { ok: false, status: 503, message: 'save: invalid server token configuration' };
  }
  if (method !== 'POST') return { ok: false, status: 405, message: 'save: POST only' };
  if (!tokenMatches(headerValue(headers, SAVE_ENDPOINT_TOKEN_HEADER), token)) {
    return { ok: false, status: 401, message: 'save: invalid token' };
  }
  if (!sameRequestOrigin(headerValue(headers, 'origin'), headerValue(headers, 'host'))) {
    return { ok: false, status: 403, message: 'save: cross-origin request rejected' };
  }
  const contentType = String(headerValue(headers, 'content-type') || '').toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    return { ok: false, status: 415, message: 'save: application/json required' };
  }
  const contentLengthRaw = headerValue(headers, 'content-length');
  if (contentLengthRaw !== undefined) {
    const contentLength = Number(contentLengthRaw);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return { ok: false, status: 400, message: 'save: invalid Content-Length' };
    }
    if (contentLength > maxBytes) {
      return { ok: false, status: 413, message: `save: body exceeds ${maxBytes} bytes` };
    }
  }

  let parsed;
  try {
    parsed = new URL(String(url), 'http://localhost');
  } catch {
    return { ok: false, status: 400, message: 'save: invalid URL' };
  }
  const requestedPath = parsed.searchParams.get('path') || '';
  const resultsRoot = resolve(cwd, 'results');
  const filePath = resolve(cwd, requestedPath);
  if (!isTrueDescendant(resultsRoot, filePath)) {
    return { ok: false, status: 403, message: 'save: path must be a file under results/' };
  }
  if (containsExistingSymlink(resultsRoot, filePath)) {
    return { ok: false, status: 403, message: 'save: symbolic-link paths are not allowed' };
  }
  if (extname(filePath).toLowerCase() !== '.json') {
    return { ok: false, status: 415, message: 'save: only .json result files are allowed' };
  }
  return { ok: true, filePath, requestedPath };
}

export function createSaveEndpointHandler({
  enabled = process.env.VITE_ENABLE_SAVE_ENDPOINT === '1',
  token = process.env.VITE_SAVE_TOKEN || '',
  cwd = process.cwd(),
  maxBytes = SAVE_ENDPOINT_MAX_BYTES,
} = {}) {
  return (req, res, next) => {
    let pathname;
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (pathname !== '/__save') return next();

    const verdict = inspectSaveRequest({
      enabled,
      token,
      method: req.method,
      url: req.url,
      headers: req.headers,
      cwd,
      maxBytes,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!verdict.ok) {
      res.statusCode = verdict.status;
      return res.end(verdict.message);
    }

    const chunks = [];
    let byteLength = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += bytes.length;
      if (byteLength > maxBytes) {
        rejected = true;
        chunks.length = 0;
        res.statusCode = 413;
        res.end(`save: body exceeds ${maxBytes} bytes`);
        return;
      }
      chunks.push(bytes);
    });
    req.on('error', () => {
      if (rejected || res.writableEnded) return;
      rejected = true;
      res.statusCode = 400;
      res.end('save: request stream failed');
    });
    req.on('end', () => {
      if (rejected) return;
      const body = Buffer.concat(chunks, byteLength);
      try {
        JSON.parse(body.toString('utf8'));
      } catch {
        res.statusCode = 400;
        return res.end('save: body must contain valid JSON');
      }
      try {
        mkdirSync(dirname(verdict.filePath), { recursive: true });
        const noFollow = fsConstants.O_NOFOLLOW ?? 0;
        writeFileSync(verdict.filePath, body, {
          flag: fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollow,
          mode: 0o600,
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end(`saved ${verdict.requestedPath} (${byteLength} bytes)`);
      } catch (err) {
        res.statusCode = 500;
        return res.end(`save error: ${err?.message || err}`);
      }
    });
  };
}

/**
 * Optional development-only persistence for a named local orchestrator. Normal manual and
 * Playwright exports do not use it. It is deliberately absent unless VITE_ENABLE_SAVE_ENDPOINT=1;
 * an enabled caller must send VITE_SAVE_TOKEN in x-media-test-save-token.
 */
function saveEndpoint() {
  const handler = createSaveEndpointHandler();
  return {
    name: 'save-results',
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default {
  // crossOriginIsolation FIRST so COOP/COEP land on every response (incl. fixtures + wasm + workers).
  plugins: [
    crossOriginIsolation(),
    ffmpegVendorStatic(),
    saveEndpoint(),
    contentAttestationEndpoint(),
    fixturesStatic(),
  ],
  // The per-file robustness Worker shares dynamically imported engine/scenario chunks with the app;
  // code-splitting workers must be emitted as ES modules rather than Vite's IIFE default.
  worker: { format: 'es' },
  // LAN exposure remains an explicit CLI choice (`serve.sh --host`); Vite itself is loopback-only.
  server: { host: '127.0.0.1', port: 5152, strictPort: true },
  preview: { host: '127.0.0.1', port: 5152, strictPort: true },
  // @aibrush/media is a file: dependency in node_modules, so vite would otherwise pre-bundle it with
  // esbuild — which rewrites the codec tails' `new URL('./x.wasm', import.meta.url)` and breaks wasm
  // loading. Exclude it so vite serves the engine as-is (same as when it lived under src/…/vendor).
  optimizeDeps: { exclude: ['@aibrush/media'] },
  // Bundle-cost evidence walks the real emitted graph. Keep the production manifest beside dist so
  // scripts/measure-bundles.mjs never falls back to a synthetic package-only build.
  build: { manifest: true },
};
