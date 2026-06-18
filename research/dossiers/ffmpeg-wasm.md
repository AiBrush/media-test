# Framework Dossier — ffmpeg.wasm (`@ffmpeg/ffmpeg` + `@ffmpeg/core` / `@ffmpeg/core-mt`)

> Research-only dossier per `test-instructions.md` §15. No `src/` code written.
> All claims that are non-obvious carry a documentation URL. Versions verified against the
> packages already installed under `node_modules/` in this repo (read directly) plus the
> current official docs at https://ffmpegwasm.netlify.app and the GitHub repo/Dockerfile.

- **id:** `ffmpeg-wasm`
- **Engine kind:** WASM, **software** codecs (a full FFmpeg CLI compiled to WebAssembly, run in a Worker). Does **not** route through WebCodecs — it owns its own decoders/encoders. In our `CapabilitySet` it therefore declares the `webcodecs:independent` feature (§4 of the spec), so it opts out of the per-browser WebCodecs gate.
- **Date researched:** 2026-06-17

---

## 1. Versions (verified)

| Package | Latest published | Installed in this repo | License | Notes |
| --- | --- | --- | --- | --- |
| `@ffmpeg/ffmpeg` (JS wrapper) | **0.12.15** | **0.12.15** (`node_modules/@ffmpeg/ffmpeg/package.json`) | **MIT** | the high-level API + the class Worker |
| `@ffmpeg/util` (helpers) | **0.12.2** | **0.12.2** | MIT | `fetchFile`, `toBlobURL`, `downloadWithProgress`, `importScript` |
| `@ffmpeg/core` (single-thread WASM core) | **0.12.10** | **NOT installed** | **GPL-2.0-or-later** | the actual FFmpeg-in-WASM engine (single-thread) |
| `@ffmpeg/core-mt` (multi-thread WASM core) | **0.12.10** | **NOT installed** | **GPL-2.0-or-later** | multi-thread engine; needs `SharedArrayBuffer` |

**Critical install gap:** this repo currently ships only `@ffmpeg/ffmpeg` + `@ffmpeg/util`. **A core (`@ffmpeg/core` and/or `@ffmpeg/core-mt`) is NOT in `node_modules`** — the wrapper is useless without one. The wrapper's built-in default `CORE_VERSION` constant is `"0.12.9"` (read from `node_modules/@ffmpeg/ffmpeg/dist/esm/const.js`), and its default `coreURL`/`wasmURL` point at **`unpkg.com`** — which §0.8 forbids at run time. We therefore MUST `bun add` a core and pass **local** URLs. See §8 (vendoring).

> License caveat for the report (§0.9 "honest caveat"): the **wrapper is MIT**, but **both cores are GPL-2.0-or-later** because the default build links `libx264`/`libx265` with `--enable-gpl` (see §6). Any product shipping the core inherits GPL. This is a real adoption cost and is recorded here, not hidden.

Sources:
- npm `@ffmpeg/ffmpeg`: https://www.npmjs.com/package/@ffmpeg/ffmpeg
- npm `@ffmpeg/core`: https://www.npmjs.com/package/@ffmpeg/core
- npm `@ffmpeg/core-mt`: https://www.npmjs.com/package/@ffmpeg/core-mt
- npm `@ffmpeg/util`: https://www.npmjs.com/package/@ffmpeg/util
- Releases (v0.12.15 main, v0.12.10 core/core-mt): https://github.com/ffmpegwasm/ffmpeg.wasm/releases
- Default `CORE_VERSION="0.12.9"` + default unpkg `CORE_URL`: read from `node_modules/@ffmpeg/ffmpeg/dist/esm/const.js` and `dist/esm/types.d.ts`.

---

## 2. Single-thread vs Multi-thread core (the headline architecture decision)

ffmpeg.wasm has a **swappable core** — "like the engine of a car … a swappable component." Two are maintained:

- **`@ffmpeg/core`** — single-thread. Works in **every** browser; no special headers. ~31 MB.
- **`@ffmpeg/core-mt`** — multi-thread (pthreads via Emscripten). Spawns extra Workers inside the
  ffmpeg Worker. Requires **`SharedArrayBuffer`**, which in turn requires the page to be
  **cross-origin isolated** (COOP+COEP, see §7). ~32 MB.

**Architecture (3 layers of Workers):**
1. **Main thread** — your code calls the async API.
2. **`ffmpeg.worker` (the "class worker")** — `@ffmpeg/ffmpeg` spawns this itself on `load()` to keep heavy work off the main thread. This is *always* present, single- or multi-thread.
3. **`ffmpeg-core.worker.js`** — only with `core-mt`; these are the pthread workers the core spawns for parallel encode/decode.

**Performance delta:** the FAQ states the **mt version is "around 2x" the single-thread speed**, "but consume a lot more memory and cpu." The performance page gives a concrete point: native FFmpeg `5.2 s` → wasm single-thread `128.8 s` → wasm multi-thread `60.4 s` for the same job (so ~2.1× mt-over-st, and ~12–25× slower than native).

**Best path for this suite (§0.9):** because §0.8 hosts everything same-origin and the dev server sets COOP+COEP (the spec mandates this in §8.5), the page **is** cross-origin isolated → `SharedArrayBuffer` is available → **`@ffmpeg/core-mt` is ffmpeg.wasm's documented fastest path** and must be the chosen core. We pass `-threads N` (N ≈ `navigator.hardwareConcurrency`, capped — see §3) and record it in `configUsed`.

Sources:
- Overview / architecture (single vs mt, swappable core, worker model): https://ffmpegwasm.netlify.app/docs/overview/
- FAQ ("mt … around 2x speed … consume a lot more memory and cpu"; "2 GB … hard limit … Might become 4 GB"): https://ffmpegwasm.netlify.app/docs/faq/
- Performance benchmark (5.2 / 128.8 / 60.4 s): https://ffmpegwasm.netlify.app/docs/performance/
- mt requires SharedArrayBuffer + COOP/COEP: https://ffmpegwasm.netlify.app/docs/getting-started/usage/ (the load example notes "Multi-threading requires SharedArrayBuffer security compliance") and Discussion #744: https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/744

---

## 3. The API surface (read directly from the installed `dist/esm/classes.d.ts`)

`@ffmpeg/ffmpeg` is a **thin RPC wrapper around the FFmpeg & FFprobe command line**. There is no per-op object API — every operation is an `ffmpeg`/`ffprobe` **argv array**. The full public surface:

```ts
class FFmpeg {
  loaded: boolean;
  on(event: "log"|"progress", cb): void;     // log = stdout+stderr lines; progress is experimental
  off(event, cb): void;
  load(config?: {                            // UNTIMED init (§0.7). Spawns the class worker, fetches+compiles core+wasm.
    coreURL?, wasmURL?, workerURL?,          // local paths to the vendored core (workerURL only for -mt)
    classWorkerURL?                          // optional override for the @ffmpeg/ffmpeg class worker
  }, { signal? }?): Promise<boolean>;
  exec(args: string[], timeout?: number, { signal }?): Promise<number>;   // 0 = ok, !=0 = timeout(1)/error
  ffprobe(args: string[], timeout?: number, { signal }?): Promise<number>;// ffprobe CLI
  terminate(): void;                          // kill worker; must load() again after
  // virtual FS (Emscripten MEMFS by default):
  writeFile(path, data: Uint8Array|string, opts?): Promise<boolean>;
  readFile(path, encoding?, opts?): Promise<Uint8Array|string>;
  deleteFile(path); rename(old,new); createDir(path); listDir(path); deleteDir(path);
  mount(fsType: FFFSType, options, mountPoint): Promise<boolean>;   // WORKERFS for big inputs
  unmount(mountPoint): Promise<boolean>;
}
// FFFSType = MEMFS | NODEFS | NODERAWFS | IDBFS | WORKERFS | PROXYFS  (browser-usable: MEMFS, WORKERFS, IDBFS)
```

`@ffmpeg/util` exports: `fetchFile(file: string|File|Blob|URL) → Uint8Array`, `toBlobURL(url, mime)` (only needed to bypass CSP/CDN — **we avoid it**, §0.8/§8), `downloadWithProgress`, `importScript`.

Sources: read from `node_modules/@ffmpeg/ffmpeg/dist/esm/classes.d.ts`, `types.d.ts`, `const.js`, `dist/esm/classes.js` (worker spawn line `new Worker(new URL("./worker.js", import.meta.url), {type:"module"})`), and `node_modules/@ffmpeg/util/dist/esm/index.d.ts`. Usage doc: https://ffmpegwasm.netlify.app/docs/getting-started/usage/

---

## 4. Recommended API per operation (how each adapter op maps to an FFmpeg/FFprobe invocation)

Everything below is the **same `init()` → `writeFile`/`mount` → `exec`/`ffprobe` → `readFile`** loop; the difference is the argv. `init()` does `load()` (UNTIMED). For each op the timed window wraps only the `exec`/`ffprobe` call (plus the necessary read of the output for the oracle).

| Op | Recommended call | Notes |
| --- | --- | --- |
| **probe** | `ffprobe(["-v","error","-show_entries","format=duration:stream=codec_name,width,height,r_frame_rate,channels,sample_rate","-of","json","-i", in])` → read the JSON output file | `ffprobe()` is a first-class method. Returns container/stream metadata for the A.11/A.2 oracles. |
| **demux / iterate packets** | `ffprobe(["-show_packets","-select_streams","v:0","-of","json", in])` → parse packets; OR `exec(["-i",in,"-c","copy","-f","null","-"])` to walk packets fast | For packets/s, `-show_packets` enumerates pts/dts/size/keyframe flags (matches `golden.packets.json`). |
| **decode → frames** | `exec(["-i",in,"-vsync","0","frame_%05d.png"])` or `rawvideo`/`rgba` to a file, then read frames | Produces pixels for the SSIM/digest oracles; software decode (no WebCodecs). |
| **encode** | part of `transcode` — choose encoder via `-c:v libx264`/`libx265`/`libvpx-vp9`/`libvpx` etc. | Encoders available are build-gated (§6). |
| **remux (lossless)** | `exec(["-i",in,"-c","copy", out.ext])` | container change, no re-encode. e.g. `.mkv→.mp4` `-c copy`. Fast; ideal for big files via WORKERFS. |
| **transcode** | `exec(["-i",in,"-c:v","libx264","-c:a","aac", out.mp4])` (+ `-threads N` on mt) | full re-encode; the convert-to-WebM headline uses `-c:v libvpx-vp9 -vf scale=320:180`. |
| **trim / cut** | keyframe-fast: `exec(["-ss",t0,"-i",in,"-t",dur,"-c","copy", out])`; frame-accurate: put `-ss`/`-to` **after** `-i` and re-encode | `-c copy` = keyframe-aligned; re-encode = frame-accurate (A.7). |
| **mux (from encoded tracks)** | `exec(["-i",vid,"-i",aud,"-c","copy", out])` | combine streams into a container. |
| **decrypt** | **NA(engine)** for CENC/cbcs (the default build does not enable CENC decrypt protocols/keys); HLS AES-128 only if the demuxer+`-decryption_key` path is enabled (unverified → treat as NA unless runtime-detected) | see §9 limits. |
| **seek** | `exec(["-ss",t,"-i",in,"-frames:v","1", out.png])` (fast input seek) or output seek for exact | seek accuracy gated by golden keyframe map. |
| **extract audio** | `exec(["-i",in,"-vn","-c:a","copy"|"pcm_s16le", out.wav/m4a])` | A.7 extract-audio-track. |
| **metadata write (tags)** | `exec(["-i",in,"-metadata","title=...","-c","copy", out])`; rotation via `-metadata:s:v rotate=90` or `-display_rotation` | A.11 write-tags, then re-probe oracle. |
| **fragmented / CMAF** | `exec(["-i",in,"-c","copy","-movflags","frag_keyframe+empty_moov+default_base_moof", out.mp4])` | A.3/A.10 fragmented-mp4. |
| **faststart** | `exec(["-i",in,"-c","copy","-movflags","+faststart", out.mp4])` | A.3 moov-first. |

All argv-based, so coverage is essentially "whatever this FFmpeg build supports" (§6 gates it). Source for `exec`/`ffprobe` signatures & `["-nostdin","-y"]` auto-prepend: `classes.d.ts` lines 77–94; usage examples: https://ffmpegwasm.netlify.app/docs/getting-started/usage/

---

## 5. Documented BEST-PERFORMANCE path (§0.9) — recorded as `configUsed`

ffmpeg.wasm is **CPU/WASM software** — there is **no** WebCodecs/WebGPU/WebGL path; it cannot use hardware video acceleration or the GPU. Its only performance levers are:

1. **Use the multi-thread core (`@ffmpeg/core-mt`).** Documented ~2× over single-thread (§2). This is the single biggest lever and the framework's own "fastest path." Unlocked here because §0.8 hosting + the suite's COOP/COEP make the page cross-origin isolated (§7).
2. **Pass `-threads N`.** Thread-aware encoders (libx264, libx265, libvpx) parallelize. Use `N = min(navigator.hardwareConcurrency, ~8)` — beyond ~8 the FFmpeg-in-wasm scaling flattens and memory cost climbs; record the exact N. (FAQ: mt "consume a lot more memory and cpu".)
3. **Run inside the Worker (automatic).** The wrapper already offloads to `ffmpeg.worker` so the main thread is not blocked — good for the longtask metric (§8.3).
4. **Init once, reuse across iterations (§0.7/§8.4).** `load()` (download + compile + instantiate the ~32 MB core) is heavy; do it once in `init()`, awaited before the timed window. The `terminate()`/`dispose()` only between memory-clean iterations.
5. **Stream-copy whenever the op allows** (`-c copy` for remux/trim/mux) — avoids the decode+encode round-trip and the in-memory output blow-up.
6. **Large inputs via `mount('WORKERFS', {files:[file]}, '/in')`** instead of `writeFile` — WORKERFS reads the `File` lazily and is **not** subject to the 2 GB MEMFS RAM limit on the *input* side (§9).
7. **Avoid `toBlobURL`** — not a perf path; it is a CDN/CSP workaround that we replace with local URLs (§8).

**Recorded `configUsed`:**
```jsonc
{
  "backend": "wasm",            // software; no GPU/WebCodecs
  "hwAccel": false,             // ffmpeg.wasm cannot use hardware codecs
  "coreBuild": "mt",            // @ffmpeg/core-mt (falls back to "st" if !crossOriginIsolated)
  "wasmThreads": 8,             // -threads N, N = min(hardwareConcurrency, 8); record actual
  "pipeline": "batch",          // CLI is batch (write whole file → exec → read); not streaming
  "queueDepth": null,           // N/A — no WebCodecs encode/decode queues
  "webgpu": false, "webgl": false,
  "fs": "WORKERFS-for-large/MEMFS-default",
  "crossOriginIsolated": true   // required for coreBuild:"mt"
}
```

> **Honest caveat (§8.5):** ffmpeg.wasm's fast path (`core-mt`) *needs* cross-origin isolation (a server/header requirement) and benefits from many CPU cores. This is recorded, not hidden. If `crossOriginIsolated === false`, the adapter must fall back to single-thread `@ffmpeg/core` (still correct, just ~2× slower) and record `coreBuild:"st"`.

Sources: Performance page https://ffmpegwasm.netlify.app/docs/performance/ ; FAQ https://ffmpegwasm.netlify.app/docs/faq/ ; Overview (worker offload) https://ffmpegwasm.netlify.app/docs/overview/ ; WORKERFS for large files Discussions #755/#516: https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/755 , https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516

---

## 6. Codecs & containers the default WASM build ships (verified from the Dockerfile)

The **authoritative** answer is the configure line in the current `Dockerfile` of `ffmpegwasm/ffmpeg.wasm` (the one that builds the published 0.12.x cores). Verified by fetching the raw Dockerfile (`main` and `master` identical):

```
./configure ... \
  --enable-gpl \
  --enable-libx264 --enable-libx265 --enable-libvpx \
  --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus \
  --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass \
  --enable-libzimg
```
(external lib versions: libvpx v1.13.1, libwebp v1.3.2, libass 0.15.0, zimg release-3.0.5)

### Video codecs
| Codec | Decode | Encode | Via |
| --- | --- | --- | --- |
| H.264 / AVC | ✅ (native dec) | ✅ | `libx264` (encode) + native decoder |
| H.265 / HEVC | ✅ (native dec) | ✅ | `libx265` (encode) + native decoder |
| VP8 | ✅ | ✅ | `libvpx` |
| VP9 | ✅ | ✅ | `libvpx` (`libvpx-vp9`); **VP9 alpha** supported via `yuva420p` |
| Theora | ✅ | ✅ | `libtheora` |
| MPEG-1 / MPEG-2 / MPEG-4 part2 | ✅ | ✅ | native FFmpeg codecs (compiled in by default) |
| **AV1** | **❌** | **❌** | **NOT built** — no `libaom`/`libdav1d`/`librav1e` in the Dockerfile → **NA(engine)** |
| ProRes | likely native dec | — | FFmpeg native ProRes exists by default; treat as runtime-detect, conservatively `?`/NA for encode |

### Audio codecs
| Codec | Decode | Encode | Via |
| --- | --- | --- | --- |
| MP3 | ✅ | ✅ | `libmp3lame` |
| Opus | ✅ | ✅ | `libopus` |
| Vorbis | ✅ | ✅ | `libvorbis` |
| AAC (LC) | ✅ | ✅ | FFmpeg **native** AAC (no fdk-aac in build — fdk-aac is **not** enabled) |
| FLAC | ✅ | ✅ | FFmpeg **native** FLAC (default-enabled, no external lib) |
| PCM s16/s24/f32, **big-endian (s16be) / 24-bit** | ✅ | ✅ | native PCM family (covers AIFF/WAV edge cases A.6/A.9) |
| ALAC | ✅ (native) | ✅ (native) | FFmpeg native ALAC, default-enabled |
| AC-3 / E-AC-3 | ✅ (native) | ✅/limited | native; runtime-detect |
| **DTS** | partial native dec | ❌ | native DCA decoder only; treat encode as NA |

### Containers (read + write)
mp4 / mov / ISOBMFF · **fragmented-mp4 / CMAF** (`-movflags frag_keyframe+empty_moov`) · **faststart** (`+faststart`) · Matroska (MKV) · WebM · MPEG-TS · WAV · MP3 · Ogg/OGV · FLAC · AAC/ADTS · AIFF · CAF · 3GP · AVI · FLV · GIF — i.e. essentially **all of FFmpeg's muxers/demuxers** that aren't behind a disabled external lib. This is the framework's biggest strength: **container coverage is near-total**, far beyond any WebCodecs-based competitor.

### Extras
- **Subtitles:** mov_text / SRT / ASS / WebVTT read+write via `libass` + native muxers (A.13).
- **Scaling/colorspace:** `libzimg` (`-vf zscale`) for high-quality resize + 601/709/2020 + HDR→SDR tone-map (A.8). Plain `scale` filter also available.
- **Subtitle burn-in / image:** `libwebp`, FreeType/HarfBuzz/fribidi present.

> **Decode vs encode nuance:** FFmpeg's *native decoders* for H.264/HEVC/MPEG/ProRes/AC3/DTS are compiled in even though the **encoders** for H.264/HEVC come from the GPL `libx264`/`libx265`. So this build **decodes** a very wide codec set and **encodes** H.264, H.265, VP8, VP9, Theora, MP3, Opus, Vorbis, AAC(native), FLAC, ALAC, PCM. The **only headline gap is AV1** (no encode and no decode).

> **Always confirm at runtime** (the docs stress this): the adapter should run `ffmpeg -encoders`/`-decoders`/`-codecs` once during `init()` and parse it to build the *exact* `capabilities()` for the installed core version, rather than trusting this table. Capabilities are 100% compile-time-determined.

Sources:
- **Dockerfile configure flags (authoritative)** fetched raw from `github.com/ffmpegwasm/ffmpeg.wasm/Dockerfile` (main & master): `--enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg`.
- Overview codec/library summary: https://ffmpegwasm.netlify.app/docs/overview/
- Core contribution / build customization: https://ffmpegwasm.netlify.app/docs/contribution/core/
- (Outdated/aspirational issue #61 lists AV1+fdk-aac+flac; **the live Dockerfile is authoritative and does NOT enable AV1 or fdk-aac** — note this discrepancy): https://github.com/ffmpegwasm/ffmpeg.wasm/issues/61

---

## 7. Required headers / flags / Worker setup

- **Worker (automatic).** `@ffmpeg/ffmpeg` spawns its class worker on `load()` via
  `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`
  (verified in `dist/esm/classes.js`). Under Vite/ESM this `new URL(..., import.meta.url)` is bundled
  & served from the local origin automatically — **no manual classWorkerURL needed** in dev. You can
  override with `load({ classWorkerURL })` if a bundler mangles it.
- **COOP/COEP (required only for `core-mt`).** The page must be **cross-origin isolated**:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  Then `window.crossOriginIsolated === true` and `SharedArrayBuffer` exists; only then will `core-mt`
  initialize. The suite's dev server is mandated to set these (spec §8.5), so mt is available.
  Static asset server should also send `Cross-Origin-Resource-Policy: cross-origin` for cross-origin
  fetched assets (here everything is same-origin, so this is moot).
- **Vite specifics:** `assetsInclude: ['**/*.wasm']`, `build.target: 'esnext'`, and serve the core
  files as static assets. The repo's `vite.config.mjs` already serves `/fixtures/**` raw; the core
  must be served similarly (from `public/` or an engine `vendor/` dir) — see §8.
- **No flag is needed for single-thread**; it runs in any browser, isolated or not.

Sources:
- Worker spawn: `node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js` (load → `new Worker(new URL("./worker.js", import.meta.url),{type:"module"})`).
- COOP/COEP + SharedArrayBuffer: https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/744 ; usage note "Multi-threading requires SharedArrayBuffer security compliance" https://ffmpegwasm.netlify.app/docs/getting-started/usage/
- Vite headers + `assetsInclude` + ESM: Discussion #798 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/798 ; self-host discussion #699 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699

---

## 8. How to VENDOR it LOCALLY (§0.8 — no CDN / no run-time `toBlobURL`)

**The wrapper's defaults point at `unpkg.com`** (verified in `const.js`/`types.d.ts`), so we MUST override every URL with a same-origin path. Steps:

1. **Install a core with bun** (the repo currently has none):
   ```
   bun add @ffmpeg/core-mt @ffmpeg/core
   ```
   Install **both**: `core-mt` for the fast path, `core` for the non-isolated fallback. Pin to **0.12.10** (latest) and keep it compatible with `@ffmpeg/ffmpeg@0.12.15`.

2. **Files to host** (from `node_modules/@ffmpeg/core*/dist/esm/`):
   - single-thread `@ffmpeg/core/dist/esm/`: `ffmpeg-core.js`, `ffmpeg-core.wasm`
   - multi-thread `@ffmpeg/core-mt/dist/esm/`: `ffmpeg-core.js`, `ffmpeg-core.wasm`, **`ffmpeg-core.worker.js`** (the pthread worker — mt only)
   > **Use the `dist/esm/` build, not `dist/umd/`, under Vite** (the docs explicitly warn Vite users to use ESM). UMD is for plain `<script>`/CommonJS setups.

3. **Serve them from the local origin.** Per this suite's layout (§3 of the spec, `.gitignore` ignores `src/engines/**/vendor/`), copy into the engine's vendor dir, e.g.
   `src/engines/ffmpeg-wasm/vendor/core-mt/{ffmpeg-core.js,ffmpeg-core.wasm,ffmpeg-core.worker.js}`
   and `src/engines/ffmpeg-wasm/vendor/core/{ffmpeg-core.js,ffmpeg-core.wasm}`.
   (Alternatively a Vite `?url` import — `import coreURL from '@ffmpeg/core-mt?url'` / `import wasmURL from '@ffmpeg/core-mt/wasm?url'` — resolves to a served local URL without copying; either is hermetic. A committed `vendor/` dir is the most explicit and matches the spec's `vendor/` convention.)

4. **Load with local URLs (NO `toBlobURL`)**:
   ```ts
   import { FFmpeg } from '@ffmpeg/ffmpeg';
   const ffmpeg = new FFmpeg();
   const base = new URL('./vendor/core-mt/', import.meta.url).href; // same-origin
   await ffmpeg.load({
     coreURL:   base + 'ffmpeg-core.js',
     wasmURL:   base + 'ffmpeg-core.wasm',
     workerURL: base + 'ffmpeg-core.worker.js',   // mt only
   });
   ```
   For single-thread fallback: same but `core/` dir and omit `workerURL`.

5. **The class worker** (`@ffmpeg/ffmpeg`'s own `worker.js`) self-hosts automatically through the
   bundler's `new URL('./worker.js', import.meta.url)`. If a build emits it cross-origin, pass
   `classWorkerURL: base2 + 'worker.js'` pointing at the vendored copy from
   `@ffmpeg/ffmpeg/dist/esm/worker.js`.

6. **Record vendored paths + pinned versions** in the run `env` (spec §11). One-time `bun install`
   download; never fetched per run; never inside a measured window (§0.7).

Sources:
- Default unpkg URLs we override: `node_modules/@ffmpeg/ffmpeg/dist/esm/const.js` + `types.d.ts`.
- "pass coreURL/wasmURL local paths, do not use toBlobURL (only to bypass CSP+CDN)": Discussion #753 / #699 — https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699
- Vite: use **esm** not umd, `?url` imports, copy to `public/`: Discussion #798 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/798
- Files in `dist/umd` vs `dist/esm`: https://www.npmjs.com/package/@ffmpeg/core

---

## 9. Honest limits (→ these become `NA(engine)` or recorded caveats)

1. **No hardware / WebCodecs / GPU.** Pure software WASM; cannot use the GPU or hardware video codecs. It will **lose every perf race** to WebCodecs-backed engines (mediabunny, platform, @remotion/webcodecs) on decode/encode/transcode/resize — it competes on **coverage and correctness**, not speed.
2. **AV1: not built.** No encode and no decode (no libaom/dav1d) → **NA(engine)** for AV1 cases (A.4/A.5). This is `NA(engine)`, distinct from a browser-codec `NA(browser)`.
3. **fdk-AAC not built** — AAC encode is FFmpeg's native encoder (good enough for the oracle, but lower quality than fdk; note in caveats).
4. **2 GB file/memory hard limit** (WASM/MEMFS). FAQ: "2 GB, which is a hard limit in WebAssembly. Might become 4 GB in the future." Plus browser typed-array caps (Chrome ~2 GB). The **massive** bucket (1–4 GB, multi-hour) will OOM for any op that needs the file in MEMFS. Mitigations: `WORKERFS` mount (read-only, lazy input, bypasses the limit for *input*) + stream-copy (`-c copy`) ops; but **re-encode output** still goes through MEMFS, so large transcodes still OOM. → expect `NA`/`OOM` on massive transcode; `PASS` possible on massive remux/trim with `-c copy` + WORKERFS.
5. **Encryption / DRM: NA.** Default build does not enable CENC `cenc`/`cbcs` decrypt or ClearKey; HLS AES-128 via FFmpeg's `crypto`/`hls` demuxer + `-decryption_key` is *possibly* present but unverified → treat A.12 as **NA(engine)** unless `init()` runtime-detection proves otherwise.
6. **No true streaming pipeline.** The CLI is batch: write whole input → `exec` → read whole output. It does not pipeline decode↔encode incrementally the way a WebCodecs orchestrator does. `pipeline:"batch"` in `configUsed`; loses time-to-first-frame/byte cases.
7. **Big bundle / load cost.** ~31–32 MB core downloaded once at `bun install` + compiled per page session. This is a `load/init time` (A.14) and `bundle-size` (A.14) fact, **excluded from op timing** (§0.7). For the `perf/bundle-size` case it is by far the **largest** bundle.
8. **GPL core.** Licensing limit for adoption (recorded, §1).
9. **Progress events** are "experimental" and only accurate when input/output lengths match — don't rely on them for timing (we use `performance.now()` per §8.3 anyway).
10. **`exec` returns a number, throws on hard error**; malformed/fuzzed input (A.16) should make `exec` return non-zero or reject — must verify it **fails gracefully within the timeout** (the `exec(args, timeout)` 2nd arg is the guard) and does not hang the worker. Good fit for the robustness dimension.

Sources: FAQ (2 GB limit, mt cost) https://ffmpegwasm.netlify.app/docs/faq/ ; Dockerfile (no AV1/fdk-aac/CENC) §6; performance (software speed) https://ffmpegwasm.netlify.app/docs/performance/ ; WORKERFS read-only/output-in-memory Discussions #516/#755 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/755

---

## 10. Appendix A coverage (which rows ffmpeg.wasm supports)

> Legend: ✅ supported & contests · ⚠️ supported with caveat · ❌ → `NA(engine)` (`-`). All gated by the
> same oracle as everyone (§0.1). Final truth = `init()` runtime `-codecs` detection + the oracle.

- **A.1 Input sources / reading modes:** ⚠️ `File`/`Blob`/`ArrayBuffer`/`Uint8Array` via `writeFile` (whole-file, in MEMFS); large files via `mount('WORKERFS',{files:[file]})` (lazy read). **No** HTTP-Range/streaming-while-downloading source (batch CLI) → loses the "lazy/range-fetch" sub-metric.
- **A.2 Containers READ (demux/probe):** ✅ near-total — mp4/mov/fmp4/CMAF/MKV/WebM/TS/Ogg/MP3/WAV/AIFF/FLAC/AAC-ADTS/CAF/3GP/AVI/FLV/GIF (FFmpeg demuxers). Strongest in the field. Probe via `ffprobe`.
- **A.3 Containers WRITE (mux):** ✅ mp4 (progressive/**faststart**/**fragmented-CMAF** via `-movflags`), mov, MKV, WebM, WAV, MP3, Ogg, ADTS/AAC, MPEG-TS. ⚠️ "in-place reserve (no second pass)" not a distinct FFmpeg feature → treat that sub-row as ❌. Streaming write target: ❌ (batch).
- **A.4 Video DECODE:** ✅ H.264, HEVC, VP8, VP9, MPEG-2, MPEG-4p2, Theora, (native ProRes). 8/10-bit ✅. ❌ **AV1**.
- **A.5 Video ENCODE:** ✅ H.264 (libx264), HEVC (libx265), VP8/VP9 (libvpx), Theora. 10-bit ✅ (x264/x265 high10/main10). ❌ **AV1**; HDR10 metadata limited → caveat.
- **A.6 Audio DECODE & ENCODE:** ✅ AAC(native), Opus, MP3, FLAC, Vorbis, PCM s16/s24/f32, **PCM big-endian & 24-bit** (AIFF/s16be edge), ALAC, AC-3. ⚠️ DTS decode-only; E-AC-3 encode limited.
- **A.7 Core ops:** ✅ probe(ops/s), demux(packets/s), decode-frames, seek, remux, transcode, trim (keyframe + frame-accurate), concat/splice (concat demuxer/filter), mux, **extract audio**, **replace/swap audio**, thumbnail/frame-at-time, fragmentation/MSE-segments. ❌ **decrypt** (CENC/HLS) → NA. (Will be slow but correct on most.)
- **A.8 Video transforms:** ✅ resize/scale (zimg `zscale` or `scale`), rotate 90/180/270 + display-matrix, flip h/v, crop/pad/letterbox, fps change, bitrate/CRF/quality/**two-pass**, colorspace 601/709/2020, **HDR→SDR tone-map** (zscale+tonemap), **VP9/VP8 alpha preservation** (yuva420p), **fan-out/ABR ladder** (one exec per rendition or `-filter_complex` split). SSIM/PSNR-gated.
- **A.9 Audio DSP:** ✅ resample (`aresample`/`-ar`), channel-mix (`-ac`/`pan`), PCM format convert incl. **big-endian/24-bit**, volume/gain (`volume`), fade (`afade`).
- **A.10 Output/streaming modes:** ✅ buffer, ✅ fragmented/CMAF, ✅ faststart, ✅ tiny-chunk TS (188-byte muxer), ✅ MSE-ready segments (`segment`/`dash` muxers). ❌ true incremental streaming target (batch).
- **A.11 Metadata/tags:** ✅ read duration/dims/fps/sr/channels (ffprobe), read tags, **write tags** (`-metadata`, re-probe), rotation/display-matrix (`-display_rotation`/`rotate`), chapters, edit lists (read), multi-track + track selection (`-map`), language/cover-art/timecode.
- **A.12 Encryption/DRM:** ❌ **NA(engine)** — CENC ctr/cbcs/ClearKey not in build; HLS AES-128 unverified. ✅ "leave-unencrypted-untouched" negative passes trivially (`-c copy`).
- **A.13 Subtitles/text/data:** ✅ read mov_text/WebVTT/SRT/ASS (libass + native), ✅ write/mux text tracks. ⚠️ GPMF/KLV data tracks: copy-through only, no parse → partial.
- **A.14 Performance dimensions:** contests **all** as a (slow, software) contender — extract-metadata ops/s, iterate-packets packets/s, **convert-to-WebM+resize 320×180 frames/s** (headline; `-c:v libvpx-vp9 -vf scale=320:180`), decode/encode fps, seek ms, **load/init time** (large — its own line §0.7), **peak memory** (high), **longtask** (low, runs in worker), **bundle size** (largest in field, ~31–32 MB). source-reads/range = whole-file (not lazy).
- **A.15 Developer/platform:** TypeScript types ✅; zero runtime deps ✅ (wrapper) but **huge WASM core**; tree-shakeable ❌ (monolithic core); runs in Worker ✅ (built-in); needs `SharedArrayBuffer`/COOP+COEP **only for mt** ✅(recorded); hardware-accelerated ❌; WebGPU/WebGL ❌; license **MIT wrapper / GPL core**.
- **A.16 Deep edge cases:** strong fit — open-GOP/B-frames ✅, VFR ✅, rotated matrix ✅, multi-track select (`-map`) ✅, **headerless MediaRecorder WebM** (FFmpeg estimates duration) ⚠️✅, **big-endian & 24-bit PCM** ✅, **MP3 Xing-TOC vs CBR** duration ✅, **FLAC ±SEEKTABLE** ✅, CENC cbcs ❌(NA), fastStart:reserve large seek ✅, fragmented/CMAF split ✅, multi-hour/many-sample ⚠️(memory), **zero-length/truncated/bit-flipped** → must **fail gracefully** via `exec` non-zero/timeout (no crash) ✅ expected, negative/seek-past-EOF ✅, 0×0/1×1 ✅, extreme fps ✅, audio/video-only/no-tracks ✅, mismatched container/codec ✅(detects), TS wraparound ✅, gapless/encoder-delay ⚠️, variable channel count ✅. **Metamorphic invariants:** all computable (`decode(remux(x))==decode(x)`, etc.) since it can do every leg.

---

## 11. Quick-reference for the adapter author

- `init()` (UNTIMED): `new FFmpeg()` → `load({coreURL,wasmURL,workerURL})` with **vendored mt** URLs (fallback to st if `!crossOriginIsolated`); then run `ffmpeg.exec(['-encoders'])` / `['-codecs']` once and parse logs to populate **honest `capabilities()`**; warm one tiny transcode. Record `configUsed`.
- Per op (TIMED): `writeFile`/`mount` input (write itself can be pre-staged outside the window if the oracle allows) → `exec`/`ffprobe` argv (with `-threads N` on mt) → `readFile` output for the oracle.
- `dispose()`: `terminate()` to free the WASM heap & workers (clean peak-mem per iteration).
- Always `["-nostdin","-y"]` are auto-prepended by `exec`/`ffprobe` (don't double them).
- Use `exec(args, timeoutMs)` so fuzz/malformed cases can't hang the worker (robustness dimension).

---

## 12. Source list (all consulted)

- ffmpeg.wasm Installation: https://ffmpegwasm.netlify.app/docs/getting-started/installation/
- ffmpeg.wasm Usage / API: https://ffmpegwasm.netlify.app/docs/getting-started/usage/
- ffmpeg.wasm Overview / Architecture: https://ffmpegwasm.netlify.app/docs/overview/
- ffmpeg.wasm Performance: https://ffmpegwasm.netlify.app/docs/performance/
- ffmpeg.wasm FAQ: https://ffmpegwasm.netlify.app/docs/faq/
- ffmpeg.wasm Core build / contribution: https://ffmpegwasm.netlify.app/docs/contribution/core/
- GitHub repo: https://github.com/ffmpegwasm/ffmpeg.wasm
- GitHub releases (versions): https://github.com/ffmpegwasm/ffmpeg.wasm/releases
- **Dockerfile (authoritative codec/configure flags)**: https://github.com/ffmpegwasm/ffmpeg.wasm (raw `Dockerfile`, main & master)
- Self-host without CDN: Discussions #699 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/699 , #753 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/753
- Vite setup (ESM, headers, ?url): Discussion #798 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/798
- Multi-thread / Next.js (COOP/COEP/SAB): Discussion #744 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/744
- Large files / WORKERFS / 2-4GB: Discussions #516 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/516 , #755 https://github.com/ffmpegwasm/ffmpeg.wasm/discussions/755
- npm: @ffmpeg/ffmpeg https://www.npmjs.com/package/@ffmpeg/ffmpeg · @ffmpeg/core https://www.npmjs.com/package/@ffmpeg/core · @ffmpeg/core-mt https://www.npmjs.com/package/@ffmpeg/core-mt · @ffmpeg/util https://www.npmjs.com/package/@ffmpeg/util
- Local package files read: `node_modules/@ffmpeg/ffmpeg/dist/esm/{classes.d.ts,classes.js,types.d.ts,const.js,const.d.ts}`, `node_modules/@ffmpeg/util/dist/esm/index.d.ts`, both `package.json`.
