// vite.config.mjs — dev/build config for the suite app.
//
// The one job here that MATTERS: serve fixtures/** as RAW static bytes (with HTTP Range support)
// BEFORE vite's module transform. Without this, a media fixture like fixtures/media/h264_ts.ts is
// intercepted by vite as a TypeScript module (→ 500), so MPEG-TS / any .ts-named asset can't be
// fetched. The runner relies on Range (MediaInput contract + source-reads metric), so we honor it.
//
// Runtime: bun (`bunx vite` / `bun x vite`). No node CLI anywhere.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

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
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.key': 'application/octet-stream', // HLS AES-128 key
};

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
        const buf = readFileSync(filePath);
        res.setHeader('Content-Type', type);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');

        const range = req.headers['range'];
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
          if (Number.isNaN(start)) start = 0;
          if (Number.isNaN(end) || end >= st.size) end = st.size - 1;
          if (start > end || start >= st.size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${st.size}`);
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return res.end(buf.subarray(start, end + 1));
        }

        res.statusCode = 200;
        res.setHeader('Content-Length', String(st.size));
        res.end(buf);
      });
    },
  };
}

export default {
  plugins: [fixturesStatic()],
};
