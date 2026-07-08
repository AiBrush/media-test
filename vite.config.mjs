// vite.config.mjs — dev/build config for the suite app.
//
// The one job here that MATTERS: serve fixtures/** as RAW static bytes (with HTTP Range support)
// BEFORE vite's module transform. Without this, a media fixture like fixtures/media/h264_ts.ts is
// intercepted by vite as a TypeScript module (→ 500), so MPEG-TS / any .ts-named asset can't be
// fetched. The runner relies on Range (MediaInput contract + source-reads metric), so we honor it.
//
// Runtime: bun (`bunx vite` / `bun x vite`). No node CLI anywhere.

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';

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
  '.wasm': 'application/wasm',
  '.key': 'application/octet-stream', // HLS AES-128 key
};

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

        const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
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

        const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
        return streamStaticFile(req, res, filePath, st, type, 'cross-origin');
      });
    },
  };
}

/** Serve /vendor/ffmpeg-wasm/** raw, ahead of Vite transforms, for classic Emscripten workers. */
function ffmpegVendorStatic() {
  const publicPrefix = '/vendor/ffmpeg-wasm/';
  const vendorRoot = join(process.cwd(), 'src', 'engines', 'ffmpeg-wasm', 'vendor');
  const vendorRootPrefix = vendorRoot.endsWith('/') ? vendorRoot : `${vendorRoot}/`;

  const serve = (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith(publicPrefix)) return next();

    const rel = decodeURIComponent(url.slice(publicPrefix.length));
    const filePath = normalize(join(vendorRoot, rel));
    if (!(filePath === vendorRoot || filePath.startsWith(vendorRootPrefix)) || !existsSync(filePath)) {
      res.statusCode = 404;
      return res.end('ffmpeg vendor: not found');
    }
    const st = statSync(filePath);
    if (st.isDirectory()) {
      res.statusCode = 404;
      return res.end('ffmpeg vendor: is a directory');
    }

    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    return streamStaticFile(req, res, filePath, st, type, 'same-origin');
  };

  return {
    name: 'ffmpeg-vendor-static',
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

/**
 * Save endpoint (the /chrome-flow's persistence): POST /__save?path=results/... writes the request
 * body to a file under results/. This is how the browser-driven run (Phase F) persists window.__RESULTS__
 * to results/raw/ — the /chrome tool blocks data exfiltration through the page, so the page POSTs its
 * results here and the dev server writes them. Strictly confined to the results/ tree.
 */
function saveEndpoint() {
  const resultsRoot = join(process.cwd(), 'results');
  return {
    name: 'save-results',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/__save') return next();
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('save: POST only');
        }
        const q = new URL(req.url || '', 'http://localhost');
        const rel = q.searchParams.get('path') || '';
        const filePath = normalize(join(process.cwd(), rel));
        if (!filePath.startsWith(resultsRoot)) {
          res.statusCode = 403;
          return res.end('save: path must be under results/');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, Buffer.concat(chunks));
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(`saved ${rel} (${Buffer.concat(chunks).length} bytes)`);
          } catch (err) {
            res.statusCode = 500;
            res.end(`save error: ${err?.message || err}`);
          }
        });
      });
    },
  };
}

export default {
  // crossOriginIsolation FIRST so COOP/COEP land on every response (incl. fixtures + wasm + workers).
  plugins: [crossOriginIsolation(), ffmpegVendorStatic(), saveEndpoint(), fixturesStatic()],
};
