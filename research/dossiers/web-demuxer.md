# Dossier — `web-demuxer` (FFmpeg-based WASM demuxer, WebCodecs-first)

> **Kind (orientation only, per `test-instructions.md` §1):** "WASM (ffmpeg-based) demuxer." The
> first thing §1 asks this research to establish: "its container list + WebCodecs-chunk output shape."
> This dossier delivers both, plus the recommended API per op, the documented best-performance path,
> required headers/Worker setup, how to vendor it LOCALLY (§0.8), the honest limits, and the
> Appendix A rows it can contest. Every non-obvious claim is cited with a doc URL.

- **Engine id (proposed):** `web-demuxer@4.0.0`
- **Package name (npm):** `web-demuxer`
- **Latest version:** **4.0.0**, published **2025-12-20** (npm registry; see Research log §13).
- **License:** MIT for the main codebase; `lib/` (FFmpeg-derived C) is LGPL. (README + repo.)
- **Repository:** https://github.com/bilibili/web-demuxer (formerly `github.com/ForeverSc/web-demuxer`;
  the npm `repository`/`homepage` fields still point at the old `ForeverSc` URL, but it redirects).
- **Adapter file (to be created later, NOT in this research pass):** `src/engines/web-demuxer/adapter.ts`
- **Researched on:** 2026-06-17.

---

## 0. One-paragraph orientation — what this library IS and ISN'T

web-demuxer is a **demuxer/parser only**, purpose-built to bridge container files to the **WebCodecs**
API. WebCodecs decodes/encodes but does **not** demux; web-demuxer fills exactly that gap, like
mp4box.js but across many more containers (it compiles FFmpeg's demuxers to WASM and runs them in a
Worker). Its headline value: it hands you a ready-to-use `VideoDecoderConfig`/`AudioDecoderConfig`
**and** `EncodedVideoChunk`/`EncodedAudioChunk` objects, so you can feed a WebCodecs `VideoDecoder`
directly. (README "Why" section + MDN's note that you need a demuxing library such as Mediabunny or
web-demuxer to get `EncodedVideoChunk`s out of a file.)
Sources: https://github.com/bilibili/web-demuxer ·
https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API

**It does NOT decode pixels, encode, mux, remux, transcode, trim, or decrypt.** It produces packets +
configs; the *decode* is your WebCodecs call, the *encode/mux* would need a separate muxer. This makes
its capability surface in this suite deliberately narrow and honest (see §4 limits, §8 Appendix-A map).

---

## 1. Latest version & how it is distributed

- **Version 4.0.0** (latest), published 2025-12-20. Full version history on npm: 1.0.0 → 4.0.0
  (24 releases). Source: npm registry JSON `https://registry.npmjs.org/web-demuxer`.
- **Zero runtime dependencies** (`dependencies: {}` in package.json) — pure self-contained ESM + WASM.
  Source: https://cdn.jsdelivr.net/npm/web-demuxer@4.0.0/package.json
- **Package entry points** (from `package.json`, verified via jsDelivr):
  - `main`: `./dist/web-demuxer.umd.cjs`
  - `module`: `./dist/web-demuxer.js`  ← use this (ESM) in the suite
  - `types`: `./dist/web-demuxer.d.ts`
  - `exports["."]`: `{ import: ./dist/web-demuxer.js, require: ./dist/web-demuxer.umd.cjs }`
  - `exports["./wasm"]`: `./dist/wasm-files/web-demuxer.wasm` (full build)
  - `exports["./wasm-mini"]`: `./dist/wasm-files/web-demuxer-mini.wasm` (mini build)
  - `files`: `["dist"]`
- **Shipped dist files** (v4.0.0, sizes from jsDelivr data API):
  | file | bytes | role |
  | --- | --- | --- |
  | `dist/web-demuxer.js` | 118,338 | ESM bundle (**the Worker is bundled in here in v4**) |
  | `dist/web-demuxer.umd.cjs` | 113,274 | UMD/CJS bundle |
  | `dist/web-demuxer.d.ts` | 9,448 | TypeScript declarations |
  | `dist/wasm-files/web-demuxer.wasm` | 3,150,317 | full demuxer build (~1.13 MB gzip) |
  | `dist/wasm-files/web-demuxer-mini.wasm` | 823,572 | mini demuxer build (~493 KB gzip) |
  Source: `https://data.jsdelivr.com/v1/packages/npm/web-demuxer@4.0.0`
- **Important architecture fact:** in v4 there is **no separate `.worker.js`** — the worker code is
  bundled inside `web-demuxer.js`. The release notes confirm v4 "bundled the worker JS in
  web-demuxer.js" and renamed the old `wasmLoaderPath` option to `wasmFilePath` (you now only
  customize the **WASM** file path, not the worker). Source: GitHub releases (v3.0.0/v4.0.0 notes) ·
  https://github.com/bilibili/web-demuxer/releases

**Install (bun, per §0.5):**
```
bun add web-demuxer
```
(`installCmd` = `bun add web-demuxer`.)

---

## 2. The authoritative API (from `dist/web-demuxer.d.ts`, v4.0.0)

The `.d.ts` is the single source of truth (fetched verbatim from
`https://cdn.jsdelivr.net/npm/web-demuxer@4.0.0/dist/web-demuxer.d.ts`). The class exposes **two
layers**: a **high-level WebCodecs layer** (returns `EncodedVideoChunk`/config) and a **low-level
packet layer** (returns raw `WebAVPacket`). Verbatim signatures:

```ts
export declare class WebDemuxer {
  source?: File | string;
  constructor(options?: WebDemuxerOptions);

  load(source: File | string): Promise<void>;
  destroy(): void;

  // ---- media info / stream metadata (probe) ----
  getMediaInfo(): Promise<WebMediaInfo>;
  getAVStream(streamType?: AVMediaType, streamIndex?: number): Promise<WebAVStream>;
  getAVStreams(): Promise<WebAVStream[]>;
  getMediaStream(type: MediaType, streamIndex?: number): Promise<WebAVStream>;

  // ---- low-level packet layer (demux) ----
  getAVPacket(time: number, streamType?: AVMediaType, streamIndex?: number, seekFlag?: AVSeekFlag): Promise<WebAVPacket>;
  getAVPackets(time: number, seekFlag?: AVSeekFlag): Promise<WebAVPacket[]>;
  readAVPacket(start?: number, end?: number, streamType?: AVMediaType, streamIndex?: number, seekFlag?: AVSeekFlag): ReadableStream<WebAVPacket>;
  seekMediaPacket(type: MediaType, time: number, seekFlag?: AVSeekFlag): Promise<WebAVPacket>;
  readMediaPacket(type: MediaType, start?: number, end?: number, seekFlag?: AVSeekFlag): ReadableStream<WebAVPacket>;

  // ---- high-level WebCodecs layer (decode-prep / seek) ----
  getDecoderConfig<T extends WebCodecsSupportedMediaType>(type: T): Promise<MediaTypeToConfig[T]>;
  seek<T extends WebCodecsSupportedMediaType>(type: T, time: number, seekFlag?: AVSeekFlag): Promise<MediaTypeToChunk[T]>;
  read<T extends WebCodecsSupportedMediaType>(type: T, start?: number, end?: number, seekFlag?: AVSeekFlag): ReadableStream<MediaTypeToChunk[T]>;

  // ---- converters & logging ----
  genDecoderConfig<T extends WebCodecsSupportedMediaType>(type: T, avStream: WebAVStream): MediaTypeToConfig[T];
  genEncodedChunk<T extends WebCodecsSupportedMediaType>(type: T, avPacket: WebAVPacket): MediaTypeToChunk[T];
  setLogLevel(level: AVLogLevel): Promise<unknown>;
}

export declare interface WebDemuxerOptions { wasmFilePath?: string; }

export declare interface WebMediaInfo {
  format_name: string; start_time: number; duration: number; bit_rate: string;
  nb_streams: number; nb_chapters: number; flags: number; streams: WebAVStream[];
}

export declare interface WebAVStream {
  index: number; id: number; codec_type: AVMediaType; codec_type_string: string;
  codec_name: string; codec_string: string;
  color_primaries: string; color_range: string; color_space: string; color_transfer: string;
  profile: string; pix_fmt: string; level: number; width: number; height: number;
  channels: number; sample_rate: number; sample_fmt: string; bit_rate: string;
  extradata_size: number; extradata: Uint8Array;
  r_frame_rate: string; avg_frame_rate: string;
  sample_aspect_ratio: string; display_aspect_ratio: string;
  start_time: number; duration: number; rotation: number; flip: boolean;
  nb_frames: string; tags: Record<string, string>;
}

export declare interface WebAVPacket {
  keyframe: 0 | 1; timestamp: number; duration: number; size: number; data: Uint8Array;
}

declare type MediaType = 'video' | 'audio' | 'subtitle';
type WebCodecsSupportedMediaType = 'video' | 'audio';   // only video|audio go through getDecoderConfig/seek/read

export declare enum AVMediaType {
  AVMEDIA_TYPE_UNKNOWN = -1, AVMEDIA_TYPE_VIDEO = 0, AVMEDIA_TYPE_AUDIO = 1,
  AVMEDIA_TYPE_DATA = 2, AVMEDIA_TYPE_SUBTITLE = 3, AVMEDIA_TYPE_ATTACHMENT = 4, AVMEDIA_TYPE_NB = 5
}
export declare enum AVSeekFlag {
  AVSEEK_FLAG_BACKWARD = 1, AVSEEK_FLAG_BYTE = 2, AVSEEK_FLAG_ANY = 4, AVSEEK_FLAG_FRAME = 8
}
export declare enum AVLogLevel {
  AV_LOG_QUIET = -8, AV_LOG_PANIC = 0, AV_LOG_FATAL = 8, AV_LOG_ERROR = 16, AV_LOG_WARNING = 24,
  AV_LOG_INFO = 32, AV_LOG_VERBOSE = 40, AV_LOG_DEBUG = 48, AV_LOG_TRACE = 56
}
```
Source (verbatim): https://cdn.jsdelivr.net/npm/web-demuxer@4.0.0/dist/web-demuxer.d.ts

### Key semantics to remember when writing the adapter
- **`read()` / `readMediaPacket()` / `readAVPacket()` `start`/`end` are SECONDS of media time**, not
  byte ranges. With no args they stream from the beginning to EOF (the README "Get all packets"
  example calls `demuxer.readMediaPacket('video')` with no bounds). Source: repo `index.html`.
- **`WebAVPacket.timestamp` and `.duration` are in seconds** (FFmpeg time converted; the lib's own
  `seek(time)` also takes seconds). The adapter must convert to the suite's `ptsUs`/`dtsUs`
  (microseconds) by `Math.round(timestamp * 1e6)`. **NOTE:** `WebAVPacket` carries only one
  `timestamp` (PTS) field — there is **no separate DTS**. For the suite's `PacketInfo.dtsUs` the
  adapter should set `dtsUs = ptsUs` (honest approximation; the lib does not surface DTS).
- **`WebAVPacket.keyframe` is `0 | 1`** → map to boolean.
- **`getDecoderConfig`/`seek`/`read` are generic over `'video' | 'audio'` only** (`subtitle` is a
  valid `MediaType` for the low-level layer but NOT for the WebCodecs layer).
- **`genDecoderConfig`/`genEncodedChunk`** are pure converters (stream/packet → WebCodecs objects) you
  can call yourself if you already hold a `WebAVStream`/`WebAVPacket` — useful to avoid re-querying.

### Verbatim usage examples (from repo README / `index.html`)
Construct + decode one seeked frame:
```js
import { WebDemuxer } from "web-demuxer";
const demuxer = new WebDemuxer({ wasmFilePath: "/web-demuxer.wasm" });
await demuxer.load(file);
const videoDecoderConfig = await demuxer.getDecoderConfig('video');
const videoChunk = await demuxer.seek('video', seekTime);   // seconds
const decoder = new VideoDecoder({ output: f => { /* draw */ f.close(); }, error: e => console.error(e) });
decoder.configure(videoDecoderConfig);
decoder.decode(videoChunk);
decoder.flush();
```
Get all video packets (the iterate-packets pattern — relevant to `perf/iterate-video-packets`):
```js
const videoPackets = [];
const reader = demuxer.readMediaPacket('video').getReader();
reader.read().then(async function processVideoPacket({ done, value }) {
  if (done) { resolve(videoPackets); return; }
  videoPackets.push(value);
  return reader.read().then(processVideoPacket);
});
```
Probe:
```js
await demuxer.load(file);
const mediaInfo = await demuxer.getMediaInfo();   // { format_name, duration, bit_rate, streams:[...] }
```
Sources: https://github.com/bilibili/web-demuxer/blob/main/index.html ·
https://github.com/bilibili/web-demuxer (README quick-start)

---

## 3. Recommended API per suite operation (the per-op map)

The suite's `Operation` set is `probe | demux | remux | transcode | decodeFrames | seek | trim | mux |
decrypt` (`src/core/engine.ts`). web-demuxer only natively does **probe, demux, seek**, and can
**decode** only by handing chunks to the browser's WebCodecs (so `decodeFrames` is feasible but is
"web-demuxer + platform WebCodecs", which the suite treats as a `webcodecs`-gated path, NOT
`webcodecs:independent`). Everything else is `NA(engine)`.

| Suite op | web-demuxer API | Notes |
| --- | --- | --- |
| **probe** | `load()` → `getMediaInfo()` (+ `getAVStreams()`) | Map `WebMediaInfo` → `NormalizedMetadata`: `format_name`→container (split on `,`), `duration`(sec)→`durationSec`, per-stream `codec_name`→canonical codec, `width/height`, fps from `avg_frame_rate`/`r_frame_rate` rational, `sample_rate`/`channels`, `rotation`, `tags`. |
| **demux** | `load()` → for each track `readMediaPacket(type)`/`readAVPacket()` drained via `getReader()` loop | Each `WebAVPacket` → `PacketInfo { trackIndex, size, ptsUs=round(ts*1e6), dtsUs=ptsUs, keyframe:!!keyframe }`. Combine streams from `getAVStreams()` for `metadata`. **No DTS** — see §2. |
| **seek** | `seek(type, tSec)` → `EncodedVideoChunk` then decode via WebCodecs `VideoDecoder` to get the landed frame; OR `seekMediaPacket` for the raw packet | `seekFlag` defaults to backward (lands on the preceding keyframe). For the suite's `seek` oracle (frame digest at landed time) the adapter must run the returned chunk through a `VideoDecoder` → RGBA → sha256. |
| **decodeFrames** | `read('video')` stream of `EncodedVideoChunk` → feed `VideoDecoder` (WebCodecs) | Works, but pixels come from **WebCodecs**, so it is **browser-codec-gated** (HEVC/AV1 → `NA(browser)` where unsupported). The decode itself is not web-demuxer's; declare carefully (see §4). |
| **remux** | — | `NA(engine)` — no muxer. |
| **transcode** | — | `NA(engine)` — no encoder/muxer. |
| **trim** | — | `NA(engine)` — produces no output container. (`read(start,end)` selects a time range of *packets*, but cannot write a file.) |
| **mux** | — | `NA(engine)` — no muxer. |
| **decrypt** | — | `NA(engine)` — no CENC/HLS-AES decryption surface. |

> Practical recommendation for the adapter: declare `operations: { probe:true, demux:true, seek:true }`
> as the **safe, lossless** core (no browser codec dependency, so they pass on every browser).
> `decodeFrames` is **optional**: if declared, it must be gated on `VideoDecoder.isConfigSupported`
> (the standard `webcodecs` feature, NOT `webcodecs:independent`), and falls to `NA(browser)` for
> HEVC/AV1 on browsers that can't configure them. The strongest, fairest contest for web-demuxer is
> **probe + demux/iterate-packets + seek** — that is its design center.

---

## 4. Honest limits (these become `NA(engine)` → `-` in the report)

- **No encode / no mux / no remux / no transcode / no trim-to-file.** It is a pure demuxer/parser.
  (README feature list is demux + media-info only; no muxer in the API surface.) → these ops are
  `NA(engine)`.
- **No decryption** (CENC `ctr`/`cbcs`, HLS AES-128, ClearKey). Not in the API. → `NA(engine)` for
  all of Appendix A.12.
- **No pixel decode of its own.** Decoding requires the browser's WebCodecs; web-demuxer never renders
  pixels. So A.4 "video codecs DECODE" is contested only as "web-demuxer + WebCodecs," gated by the
  browser (mark `webcodecs`, NOT `webcodecs:independent`). A.5 encode = `NA(engine)`.
- **No DTS in packet output** (`WebAVPacket` exposes only `timestamp` = PTS). The demux oracle must be
  tolerant: the adapter sets `dtsUs = ptsUs`. For B-frame streams this is an honest approximation, not
  a true decode order. (Verified from the `.d.ts` — no `dts` field.)
- **Whole-file model for `File` input.** `load(File)` reads the file into the WASM worker; the docs do
  **not** document HTTP-Range/partial reads for `File`. When `source` is a **URL string**, the demuxer
  fetches it; the README does not document range/streaming-while-downloading, so do **not** claim A.1
  "streaming input / HTTP Range / read-without-whole-file" until verified at runtime. Treat lazy/range
  reading as **unconfirmed** (→ `NA`/`—` until measured). (No streaming-source claim found in README.)
- **No documented multi-threading / SharedArrayBuffer.** The build is a single-Worker, single-thread
  WASM demuxer; nothing in the docs mentions threads, COOP/COEP, or `SharedArrayBuffer` (see §6). So
  it does not get the mt-WASM "best path" that ffmpeg.wasm does.
- **HLS (.m3u8) / fragmented-playlist demux is not advertised.** The format list is single-file
  containers (mp4/mov/mkv/webm/flv/avi/ts/…); m3u8 playlist following is not documented → `NA(engine)`
  for HLS as a container (it can still demux a raw `.ts` segment).
- **Subtitle/text extraction** exists only as low-level packets (`MediaType` includes `'subtitle'` for
  `readAVPacket`), but there is no documented text decoding (mov_text/WebVTT) → treat A.13 read as
  packet-only/unverified, write as `NA(engine)`.

---

## 5. Containers & codecs

### Containers — READ (demux/probe). Two WASM builds:
- **Full** (`web-demuxer.wasm`, ~1.13 MB gzip): mov, mp4, m4v, avi, flv, mkv, webm, mpeg, asf
  (wmv), mpegts (ts), and more ("mov/mp4/mkv/webm/flv/m4v/wmv/avi/ts and more formats" — README
  feature list; format table lists "mov, mp4, avi, flv, mkv, webm, mpeg, asf, mpegts, etc.").
- **Mini** (`web-demuxer-mini.wasm`, ~493 KB gzip): mov, mp4, mkv, webm, m4v only.
- **Customizable build:** you can compile a WASM that enables only the demuxers you need via the
  `Makefile` `DEMUX_ARGS` (e.g. `--enable-demuxer=mov,mp4,m4a,3gp,3g2,mj2`) then `npm run build:wasm`
  in the provided Docker toolchain (`npm run dev:docker:arm64` / `:x86_64`). For this suite we vendor a
  **prebuilt** wasm (no custom build needed). Source: README "Custom Demuxer".

> **Adapter `containersIn` recommendation (using the FULL prebuilt wasm):**
> `['mp4','mov','mkv','webm','ts','avi','flv']` (canonical tokens the suite knows). `avi`/`flv` are not
> in the suite's `CANONICAL_CONTAINERS` list, so the adapter should only declare tokens the suite
> recognizes (`mp4,mov,mkv,webm,ts`) plus any extras it chooses to add to the canonical list later.
> **`containersOut: []`** (demuxer writes nothing).

### Codecs
- **Decode (via WebCodecs, browser-gated):** whatever the *container* carries and the *browser* can
  configure — typically H.264, VP8, VP9, AV1 everywhere; HEVC only where the browser supports it.
  web-demuxer itself does not decode; it just produces the `EncodedVideoChunk` + `VideoDecoderConfig`
  (incl. `description`/extradata from `WebAVStream.extradata`). So codec coverage = "container parses"
  ∧ "browser decodes."
- **Encode:** none (`NA(engine)`).
- **Audio:** same model — produces `EncodedAudioChunk` + `AudioDecoderConfig` for AAC/Opus/MP3/FLAC/
  etc. that the container holds; actual decode is WebCodecs.

> **Adapter codec declarations (conservative, honest):** since the engine only *parses* and never
> *renders/encodes*, the most defensible declaration is to leave `videoCodecs`/`audioCodecs` reflecting
> what it can *identify and packetize* (for the probe/demux contests), and to NOT claim decode unless
> `decodeFrames` is implemented behind the `webcodecs` gate.

---

## 6. Best-performance path (§0.9) & required headers/Worker/flags

- **Worker offload is built-in and automatic.** The WASM runs in a Worker that is **bundled inside
  `web-demuxer.js`** (v4). You do not spawn or configure a worker yourself; constructing `WebDemuxer`
  and calling `load()` initializes it. This satisfies the §0.9 "Worker offload" guideline out of the
  box. Source: v4 release notes ("bundled the worker JS in web-demuxer.js"); jsDelivr file list shows
  no separate worker file.
- **No multi-threaded WASM / no SharedArrayBuffer requirement.** Nothing in the docs requests COOP/COEP
  or `SharedArrayBuffer`; it is a single-thread demuxer. So its best path is NOT gated on
  cross-origin isolation. (It still benefits from the suite's COOP/COEP headers — see below — only
  insofar as those enable `measureUserAgentSpecificMemory()` for the suite's peak-memory metric, not
  for web-demuxer itself.) Source: README/release notes contain no thread/SAB/COOP/COEP mention.
- **v4 Safari fix — non-ASYNCIFY packet reads.** v4.0.0 "refactor read_av_packet to non-ASYNCIFY
  variant" to fix Safari and reduce overhead. For best performance and cross-browser correctness,
  **use v4.0.0+** and prefer the streaming `read*()`/`getReader()` loop (it is the path that benefited
  from the non-ASYNCIFY refactor). Source: https://github.com/bilibili/web-demuxer/releases
- **Pipelining / streaming:** the documented fast path for processing many frames is the **streaming
  `read('video', start, end)` / `readMediaPacket('video')` `ReadableStream`** drained with a
  `getReader()` loop, decoding each chunk as it arrives, rather than collecting all packets first. This
  is exactly the §0.9 "pipelined/streaming over batch" recommendation and is the pattern in the repo
  demo. For decode throughput, feed the chunks into a `VideoDecoder` and bound the in-flight work via
  `decoder.decodeQueueSize` (WebCodecs back-pressure) — web-demuxer exposes no internal queue knob, so
  queue-depth tuning lives on the WebCodecs side.
- **Seek fast path:** `seek(type, time)` with default `AVSEEK_FLAG_BACKWARD` lands on the preceding
  keyframe (fast, single chunk). Use `AVSEEK_FLAG_ANY` for nearest-packet (may be non-keyframe) and
  decode forward for exactness.
- **Use the right WASM build:** the **mini** build (493 KB gzip) loads faster for mp4/mov/mkv/webm/m4v
  workloads; the **full** build (1.13 MB gzip) for avi/flv/ts/asf/mpeg. Load/init is untimed (§0.7),
  but smaller wasm = faster `init()` for the separately-reported load/init metric.

**`configUsed` to record per §8.5 / §0.9:**
```json
{
  "backend": "wasm-demuxer + WebCodecs(decode)",
  "hwAccel": "n/a (demux); WebCodecs hardware decode when decodeFrames is used",
  "wasmThreads": 1,
  "sharedArrayBuffer": false,
  "coopCoep": "not required by web-demuxer",
  "worker": "built-in (bundled in web-demuxer.js, v4)",
  "pipeline": "streaming read()/getReader() loop",
  "queueDepth": "WebCodecs decodeQueueSize (engine exposes none)",
  "coreBuild": "full (web-demuxer.wasm) | mini (web-demuxer-mini.wasm)",
  "version": "4.0.0"
}
```

---

## 7. VENDOR IT LOCALLY (§0.8 — no CDN at run time)

§0.8 is absolute: nothing is fetched from the internet at run time. The README's default examples use
a jsDelivr CDN `wasmFilePath` — **the adapter MUST NOT do that.** Two things are needed locally:
1. **The JS bundle** (`web-demuxer.js`, worker bundled in): this comes in via `bun add web-demuxer` →
   `node_modules/web-demuxer/dist/web-demuxer.js`, imported as `import { WebDemuxer } from 'web-demuxer'`.
   Vite/bun bundles it from `node_modules` (same-origin), so the JS + worker are already local. No CDN.
2. **The `.wasm` file** must be served from the local origin and pointed to via the constructor
   `wasmFilePath`. The package does NOT auto-resolve the wasm from `node_modules`; you must copy/serve
   it. Recommended, hermetic options (pick one):

   **Option A — Vite `?url` import (cleanest, fully local, content-hashed):**
   ```ts
   import wasmUrl from 'web-demuxer/dist/wasm-files/web-demuxer.wasm?url';
   const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl });
   ```
   Vite emits the wasm as a local asset and gives a same-origin URL. (Use `web-demuxer-mini.wasm?url`
   for the mini build.)

   **Option B — copy into the engine's `vendor/` dir** (matches `.gitignore`
   `src/engines/**/vendor/`): copy `node_modules/web-demuxer/dist/wasm-files/web-demuxer.wasm`
   → `src/engines/web-demuxer/vendor/web-demuxer.wasm`, served at a same-origin path, then
   `new WebDemuxer({ wasmFilePath: '/src/engines/web-demuxer/vendor/web-demuxer.wasm' })` (or import
   it with `?url`). Do this in a vendor step (e.g. extend `scripts/`), never fetch at run time.

   **Option C — `vite-plugin-static-copy`** (the README-endorsed approach) to copy
   `dist/wasm-files/web-demuxer.wasm` from `node_modules` into the served static dir; then
   `wasmFilePath: '/web-demuxer.wasm'`. README source for static-copy approach:
   https://github.com/bilibili/web-demuxer (WASM file deployment section).

> **Recommended for this suite: Option A** (`?url` import) — it is pure Vite, content-hashed, requires
> no extra copy script, and is guaranteed same-origin/offline. Record the resolved path in the run
> `env` per §11. **Never** leave the default CDN `wasmFilePath`.

**Headers/flags:** web-demuxer needs **none** (no COOP/COEP, no browser flags). The suite's COOP/COEP
headers (set for ffmpeg.wasm + `measureUserAgentSpecificMemory`) are harmless to it. The bundled
worker requires the JS to be served same-origin (it is, from `node_modules` via Vite). Note: the
repo's current `vite.config.mjs` does NOT yet set COOP/COEP — that is needed for ffmpeg.wasm's mt core
and for precise peak-memory, but is **not** a web-demuxer requirement.

---

## 8. Appendix A coverage (which rows web-demuxer can contest)

Legend: ✅ = genuinely supported (its own work); ⚠️ = only via browser WebCodecs (browser-gated);
`-` = `NA(engine)`.

- **A.1 Input sources & reading modes:** ✅ `File`/`Blob`, `ArrayBuffer` (via File), URL string.
  ⚠️/unverified: HTTP-Range / streaming-while-downloading / read-without-whole-file (not documented →
  do not claim until runtime-verified).
- **A.2 Containers — READ (demux/probe):** ✅ mp4, mov, mkv, webm, ts (+ avi, flv, asf, mpeg with full
  build). `-` for HLS(m3u8), and for the audio-elementary containers not in its list (it focuses on AV
  containers; raw mp3/wav/flac/aac/ogg/aiff/caf demux is NOT advertised — treat as `-`/unverified).
- **A.3 Containers — WRITE (mux):** `-` (no muxer).
- **A.4 Video codecs — DECODE:** ⚠️ via WebCodecs only (H.264/VP8/VP9/AV1 broadly; HEVC where browser
  supports). web-demuxer supplies config+chunks; it renders no pixels itself.
- **A.5 Video codecs — ENCODE:** `-`.
- **A.6 Audio codecs — DECODE & ENCODE:** decode ⚠️ via WebCodecs (AAC/Opus/MP3/FLAC chunks+config);
  encode `-`.
- **A.7 Core operations:** ✅ probe/extract-metadata, ✅ demux/iterate-packets, ✅ seek
  (keyframe via BACKWARD flag; exact via decode-forward through WebCodecs), ⚠️ decode-frames (WebCodecs),
  ⚠️ thumbnail/frame-at-time (= seek + WebCodecs decode). `-` for remux, transcode, trim, concat, mux,
  extract-audio-to-file, replace-audio, decrypt, fragmentation/MSE-segments.
- **A.8 Video transforms:** `-` (no encoder; cannot resize/rotate/fps/crop/alpha/fan-out). It can READ
  `rotation`/`flip` metadata (A.11), but cannot apply transforms.
- **A.9 Audio transforms / DSP:** `-`.
- **A.10 Output / streaming modes:** `-` for output (writes nothing). It does stream *input* packets,
  but the row is about output targets → `-`.
- **A.11 Metadata / tags / structure:** ✅ READ duration/dims/fps/sample-rate/channels/tags/rotation/
  display-matrix/`flip`/multi-track (`getAVStreams`) + language via `tags`. `-` for WRITE tags,
  chapters surface only as `nb_chapters` count (no chapter list documented), edit-lists not exposed.
- **A.12 Encryption / DRM:** `-` (no decrypt).
- **A.13 Subtitles / text / data tracks:** ⚠️ READ as low-level packets only (`MediaType 'subtitle'`
  in `readAVPacket`); no documented text decode → treat as packet-only/unverified. WRITE `-`.
- **A.14 Performance dimensions:** contests ✅ extract-metadata **ops/s**, ✅ iterate-video-packets
  **packets/s** (its strongest case), ⚠️ decode fps (WebCodecs), seek **ms/seek**, load/init time
  (reported separately; smaller with mini wasm), peak memory, longtask ms, bundle size
  (JS ~118 KB + wasm 1.13 MB/0.49 MB gzip). encode fps `-`.
- **A.15 Developer/platform aspects:** ✅ TypeScript types (ships `.d.ts`), ✅ zero runtime deps,
  ✅ runs in a Worker (built-in), needs `SharedArrayBuffer`/COOP+COEP = **NO**, hardware-accel =
  only through WebCodecs decode, WebGPU/WebGL = n/a (no pixel work), license MIT (+ LGPL FFmpeg lib).
- **A.16 Deep edge cases:** can be exercised for **demux/probe/seek** robustness: open-GOP & B-frame
  reorder (packets, but no DTS — approximate), VFR (nominal vs real fps from `r_/avg_frame_rate`),
  rotated (`rotation` metadata, not w/h swap), multi-track select (`streamIndex`),
  headerless-MediaRecorder-WebM duration (probe), many-samples/multi-hour iterate, zero-length/
  truncated/bit-flipped → must fail gracefully (run in a Worker per §7; web-demuxer already uses one).
  Audio-specific PCM/Xing/FLAC-SEEKTABLE edges depend on whether it parses those elementary streams
  (unverified → `-`/measure). CENC `cbcs` / AES-128 → `-`.

**Metamorphic invariants (A.16):** web-demuxer can supply the read side of
`probe(remux(x)).dur ≈ probe(x).dur` and `decode(remux(x))==decode(x)` **only as a reader** (it cannot
remux), and `probe(x).dur consistent across containers` (probe-only). Pure-write invariants `-`.

---

## 9. Suggested `capabilities()` for the adapter (honest, conservative)

```ts
capabilities(): CapabilitySet {
  return {
    operations: { probe: true, demux: true, seek: true /*, decodeFrames: true (optional, webcodecs-gated)*/ },
    containersIn: ['mp4', 'mov', 'mkv', 'webm', 'ts'],   // canonical tokens; full wasm also reads avi/flv/asf/mpeg
    containersOut: [],                                    // demuxer: writes nothing
    videoCodecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],  // identified/packetized; decode is browser-gated
    audioCodecs: ['aac', 'opus', 'mp3', 'flac', 'vorbis'],
    encryption: [],
    // 'webcodecs' (NOT 'webcodecs:independent') because any pixel decode routes through the browser.
    features: ['metadata:read', 'multitrack', 'rotation:read', 'seek:keyframe'],
  };
}
```
(Do **not** declare `webcodecs:independent` — that opt-out is for engines that decode without the
browser, e.g. ffmpeg.wasm; web-demuxer's pixels come from WebCodecs and must stay browser-gated.)

---

## 10. Init / dispose mapping (untimed, §0.7)

- **`init()`** (untimed): `import('web-demuxer')`, construct `new WebDemuxer({ wasmFilePath: <local url> })`.
  Optionally pre-`load()` is **not** possible without the input (load is per-file), so the heavy
  one-time cost captured by `init()` is the WASM compile/instantiate inside the bundled worker. If the
  adapter reuses one `WebDemuxer` across ops, the wasm compiles once. Per-op, `load(input)` re-reads
  the specific file (that read is part of the op, since it is per-input — but the wasm compile is not).
- **`dispose()`**: call `demuxer.destroy()` to tear down the worker + free WASM heap (clean
  peak-memory per §4 of the spec).

---

## 11. Risks / things to verify at runtime (before any number is admissible)

1. **PTS units of `WebAVPacket.timestamp`/`duration`.** The `.d.ts` types them as `number`; the
   `seek(time)` API is in **seconds**, and the demo treats packet timestamps as seconds. Confirm the
   actual unit empirically (probe a known asset, compare to golden) before trusting the demux oracle's
   per-track origin-offset check. The adapter's `ptsUs = round(timestamp * 1e6)` assumes seconds.
2. **No DTS** → the demux oracle's keyframe/order checks must tolerate `dtsUs == ptsUs`. Coordinate
   with `oracles.ts` (order-independent, per-track offset) — should be fine, but verify on a B-frame
   asset.
3. **HTTP-Range / lazy reading (A.1).** Unconfirmed in docs. Measure source-reads/range-fetches in the
   suite; if `load(url)` fetches the whole file, do not claim lazy reading.
4. **Audio-elementary containers (mp3/wav/flac/aac/ogg).** Not in the advertised format list; verify
   whether the full wasm demuxes them before declaring those `containersIn`.
5. **Graceful failure on malformed/zero-length/truncated input (A.16).** Confirm `load()`/`getMediaInfo()`
   reject (no crash/hang/OOM) within the Worker timeout.
6. **CDN default.** Ensure the adapter sets a **local** `wasmFilePath` (§7) — the library's default
   points at jsDelivr, which would violate §0.8 if left unset.

---

## 12. Quick-reference summary

- **What it is:** FFmpeg-in-WASM **demuxer/probe/seek**, WebCodecs-first, Worker-bundled, zero-dep,
  MIT (+LGPL lib). v4.0.0, 2025-12-20.
- **Best contest:** `perf/extract-metadata` (ops/s) and `perf/iterate-video-packets` (packets/s), plus
  seek — its design center. Loses every encode/mux/transcode/trim/decrypt case (`NA(engine)`).
- **Output shape:** high-level → `EncodedVideoChunk`/`EncodedAudioChunk` + `VideoDecoderConfig`/
  `AudioDecoderConfig`; low-level → `WebAVPacket { keyframe(0|1), timestamp(sec), duration, size, data }`,
  `WebAVStream`, `WebMediaInfo`.
- **Vendoring:** `bun add web-demuxer`; import `WebDemuxer` from the package (worker bundled); serve the
  `.wasm` locally and pass `wasmFilePath` (prefer Vite `?url` import). Never use the default CDN path.
- **Headers/flags:** none required (no COOP/COEP/SAB). Single-thread WASM in a built-in Worker.

---

## 13. Research log (sources, all read 2026-06-17)

- npm package page / registry: https://www.npmjs.com/package/web-demuxer ·
  https://registry.npmjs.org/web-demuxer · https://registry.npmjs.org/web-demuxer/latest
  → version 4.0.0, published 2025-12-20; `dependencies: {}`; entry points; `files:["dist"]`.
- GitHub repo + README: https://github.com/bilibili/web-demuxer (formerly
  https://github.com/ForeverSc/web-demuxer) → features, container list (full vs mini), WASM
  deployment, custom-build, MIT/LGPL license, quick-start examples.
- Releases / changelog: https://github.com/bilibili/web-demuxer/releases → v4.0.0 (flip property,
  non-ASYNCIFY read_av_packet for Safari, worker bundled in JS, `wasmLoaderPath`→`wasmFilePath`);
  v3.0.0 API consolidation (`readMediaPacket`/`seekMediaPacket`/`getMediaStream`/`getDecoderConfig`,
  `seek`/`read`); v3.0.3 rotation alignment to WebCodecs.
- TypeScript declarations (authoritative API): https://cdn.jsdelivr.net/npm/web-demuxer@4.0.0/dist/web-demuxer.d.ts
- Package manifest: https://cdn.jsdelivr.net/npm/web-demuxer@4.0.0/package.json
- dist file inventory + sizes: https://data.jsdelivr.com/v1/packages/npm/web-demuxer@4.0.0
- Repo demo (usage patterns: getAll packets loop, seek+decode, getMediaInfo, constructor):
  https://github.com/bilibili/web-demuxer/blob/main/index.html
- Live docs/demo: https://bilibili.github.io/web-demuxer/ (and old https://foreversc.github.io/web-demuxer/)
- WebCodecs context (why a demuxer is needed): https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
