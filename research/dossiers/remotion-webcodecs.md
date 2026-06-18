# Dossier — `@remotion/webcodecs`

> Research-first dossier per test-instructions.md §15. **No adapter/source code written.** Every
> non-obvious claim is cited to current official docs / source / npm registry. Researched **2026-06-17**.

| Field | Value |
| --- | --- |
| npm package | `@remotion/webcodecs` |
| Latest version | **4.0.479** (published 2026-06; from npm registry `latest` tag) |
| Kind (per its docs) | **WebCodecs converter** — browser-only media conversion built on `@remotion/media-parser` + the native WebCodecs API |
| Core dependency | `@remotion/media-parser@4.0.479` (pinned exact, no `^`) — does the parsing/demux/seek; webcodecs does decode/encode/mux |
| License | **Remotion License** — free for individuals & teams ≤ 3; Company license required for larger orgs (telemetry/monetization REMOVED in v4.0.399, so this package is now de-facto unmonetized) |
| Status | **EXPERIMENTAL + being PHASED OUT** — docs: "We are phasing out Remotion WebCodecs and are moving to Mediabunny!" and "This package is experimental. The API may change at any time." |
| Docs root | https://www.remotion.dev/docs/webcodecs |
| Source root | https://github.com/remotion-dev/remotion/tree/main/packages/webcodecs |

---

## 0. One-paragraph identity

`@remotion/webcodecs` is a **client-side video converter**. You hand `convertMedia()` a `src`
(URL / `File` / `Blob`) and a target `container` (`mp4` | `webm` | `wav`), and it parses the input with
`@remotion/media-parser`, decodes/encodes via the **native WebCodecs API** (so it gets **GPU/hardware
acceleration**, unlike WASM converters), and writes the output to disk via the **OPFS** (`webFsWriter`)
or an in-memory buffer. It is a **transcode/remux/resize/rotate** tool, **not** a general muxer, packet
API, or DRM tool. Its read/probe/demux/seek capabilities come transitively from `@remotion/media-parser`.
Because Remotion is migrating to **Mediabunny** (the reference engine in this suite), this package's API
is frozen-ish but unstable; treat it as a contender, not a long-term bet. Source: docs root + npm.

---

## 1. Latest version & how it is laid out

- **Version 4.0.479**, `main: dist/index.js`, `module: dist/esm/index.mjs`, `types: dist/index.d.ts`.
  Source: npm registry `https://registry.npmjs.org/@remotion/webcodecs/latest`.
- **Subpath exports** (from registry `exports`): `.` (main), `./web-fs` (OPFS writer), `./buffer`
  (in-memory writer), `./worker` (frame-extraction worker entry), `./package.json`.
- Single runtime dependency: `@remotion/media-parser@4.0.479` (exact-pinned). Remotion's rule: keep
  `remotion` and **all** `@remotion/*` at the **identical** version with **no `^`** to avoid conflicts.
  Source: npm registry + docs install notes.

### 1.1 Complete public API surface (authoritative — from `src/index.ts` on `main`)

Verified verbatim from https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/webcodecs/src/index.ts:

- `convertMedia` — the headline transcode/remux/resize/rotate entry.
- `getAvailableContainers`, `getAvailableVideoCodecs`, `getAvailableAudioCodecs` — capability queries.
- `getDefaultVideoCodec`, `getDefaultAudioCodec` — defaults per container.
- `canReencodeVideoTrack`, `canReencodeAudioTrack`, `canCopyVideoTrack`, `canCopyAudioTrack` — per-track feasibility checks (return promises that gate `reencode` vs `copy`).
- `defaultOnVideoTrackHandler`, `defaultOnAudioTrackHandler` — the default track decision logic.
- `webcodecsController` (+ type `WebCodecsController`) — pause / resume / abort.
- `rotateAndResizeVideoFrame` (+ `WebCodecsInternals.{rotateAndResizeVideoFrame,normalizeVideoRotation}`).
- `extractFrames`, `ExtractFrames`, `ExtractFramesProps` — efficient frame extraction.
- `createVideoDecoder`, `createAudioDecoder`, `createVideoEncoder`, `createAudioEncoder` — low-level WebCodecs wrappers with built-in `waitForQueueToBeLessThan()` backpressure.
- `convertAudioData` (+ `ConvertAudioDataOptions`), `getPartialAudioData` (+ props) — audio DSP helpers.
- `AudioUndecodableError`, `VideoUndecodableError` — typed errors.
- Types: `ConvertMediaContainer`, `ConvertMediaVideoCodec`, `ConvertMediaAudioCodec`, `ResizeOperation`, `VideoOperation`, `AudioOperation`, `ConvertMediaOnVideoTrackHandler`, `ConvertMediaOnAudioTrackHandler`, `ConvertMediaOnProgress`, `ConvertMediaProgress`, `ConvertMediaResult`, `ConvertMediaOnVideoFrame`, `ConvertMediaOnAudioData`, `WebCodecsVideoDecoder`/`...AudioDecoder`/`...VideoEncoder`/`...AudioEncoder`.

> **Correction to a common misreading:** `convertMediaOnWebWorker` and `parseMediaOnWebWorker` are
> **NOT** exported by `@remotion/webcodecs`. The only Worker entry here is `./worker` →
> `extractFramesOnWebWorker` (frame extraction). Worker parsing lives in `@remotion/media-parser`
> (`parseMediaOnWebWorker`). The webcodecs **conversion** pipeline itself runs on **the thread you call
> it from**. Source: `src/index.ts`, `src/worker.ts`, file listing of `packages/webcodecs/src`.

---

## 2. Recommended API per operation (probe / demux / decode / encode / remux / transcode / trim / mux / decrypt / seek)

This package is a *converter*; several "ops" are served by its `@remotion/media-parser` dependency, and
several are simply **not supported**. The honest mapping:

| Op | Recommended API | Notes / Source |
| --- | --- | --- |
| **probe** | `parseMedia({ src, fields:{ durationInSeconds, dimensions, fps, numberOfAudioChannels, sampleRate, tracks, container, ... } })` (from `@remotion/media-parser`) | "fast" fields (dimensions, durationInSeconds) come from the header; `slowFps`/`slowDurationInSeconds`/`slowKeyframes` force a full pass. Range-capable. https://www.remotion.dev/docs/media-parser/parse-media , .../fast-and-slow |
| **demux / iterate packets** | `parseMedia({ src, onVideoTrack: (track)=>(sample)=>{…}, onAudioTrack: … })` — returning a sample callback emits each `MediaParserSample` (maps to `EncodedVideoChunk`/`EncodedAudioChunk`). | Returning any sample callback forces full parse. Callbacks are async + backpressure-aware. https://www.remotion.dev/docs/media-parser/webcodecs , .../samples |
| **decode (→ pixels)** | `extractFrames({ src, timestampsInSeconds, onFrame })` for frame-at-time; or `createVideoDecoder()` + feed `EncodedVideoChunk`s from `parseMedia` for streaming decode. | `extractFrames` is the documented "efficiently extract frames" path; can run on a Worker via `./worker` `extractFramesOnWebWorker`. https://www.remotion.dev/docs/webcodecs/extract-frames |
| **encode** | Implicit inside `convertMedia()` (uses `createVideoEncoder`/`createAudioEncoder`); low-level `createVideoEncoder()`/`createAudioEncoder()` exported for custom pipelines. | Encoder config sets `hardwareAcceleration:'prefer-hardware'` then falls back to `'prefer-software'`. `src/video-encoder-config.ts` |
| **remux (lossless container change)** | `convertMedia({ src, container, onVideoTrack:()=>({type:'copy'}), onAudioTrack:()=>({type:'copy'}) })` | Use `canCopyVideoTrack()`/`canCopyAudioTrack()` to verify copy is legal for the target container; else it must reencode. https://www.remotion.dev/docs/webcodecs/track-transformation |
| **transcode (re-encode + resize + rotate)** | `convertMedia({ src, container, videoCodec, audioCodec, resize, rotate, onProgress, controller })` → `await result.save()` | The headline path. https://www.remotion.dev/docs/webcodecs/convert-media |
| **trim / cut** | **NOT SUPPORTED as a first-class option.** Docs explicitly list "Soon: Compress, **trim**, crop videos." No `start`/`end`/`trim` field on `convertMedia`. | A manual workaround exists (decode + drop frames outside range via `onVideoFrame`/controller seek) but it is **not a documented/endorsed fast path**, so → `NA(engine)` for the trim case. https://www.remotion.dev/docs/webcodecs |
| **mux (from pre-encoded `EncodedTrack`s)** | **NOT SUPPORTED.** No public muxer that accepts arbitrary externally-encoded chunks; muxing only happens internally inside `convertMedia` driven from a parsed `src`. | → `NA(engine)` for the suite's `mux()` op (which feeds `EncodedTracks` in). |
| **decrypt (CENC / HLS-AES)** | **NOT SUPPORTED.** No decrypt API; encrypted inputs are out of scope. (HLS `.m3u8` is a supported *input container* but DRM decryption is not exposed.) | → `NA(engine)` for all encryption cases. |
| **seek** | `mediaParserController()` + `.seek(timeInSeconds)` passed to `parseMedia` (seeks to best keyframe ≤ t, using MP4 `stbl` / WebM Cues / seeking hints). Forward seek is disallowed when `slowDurationInSeconds` is requested. | This is the **media-parser** controller, distinct from `webcodecsController`. https://www.remotion.dev/docs/media-parser/seeking |
| **concat / splice** | **NOT SUPPORTED** (single `src` per `convertMedia`). | → `NA(engine)`. |
| **extract audio track / replace audio** | Partial: `convertMedia({ container:'wav' })` extracts audio to WAV; `getPartialAudioData()` pulls a time window of audio. Replace/swap audio (mux external audio) → not supported. | https://www.remotion.dev/docs/webcodecs (extract audio) ; `src/get-partial-audio-data.ts` |

---

## 3. Supported inputs / outputs / codecs (authoritative)

### 3.1 Input containers (read, via `@remotion/media-parser`)
`.mp4`, `.webm`, `.mov`, `.mkv`, `.m3u8` (HLS), `.ts` (MPEG-TS), `.avi`, `.mp3`, `.flac`, `.wav`,
`.m4a`, `.aac`. Source: https://www.remotion.dev/docs/webcodecs (overview), media-parser docs.

### 3.2 Output containers (write) — **only three**
`mp4` · `webm` · `wav`. Source: `getAvailableContainers` / docs convert-media: *"Currently, 'mp4',
'webm' and 'wav' are supported."*

### 3.3 Output video codecs — **per container** (authoritative from source)
From `src/get-available-video-codecs.ts` — union `['vp8','vp9','h264','h265']`, mapped:
- `mp4` → `['h264','h265']`  (h265 = HEVC)
- `webm` → `['vp8','vp9']`
- `wav` → `[]` (audio-only container)

**No AV1 encode. No ProRes encode.** (AV1/HEVC encode/decode are also browser-gated → `NA(browser)`
where the browser can't configure the codec, distinct from `NA(engine)`.)

### 3.4 Output audio codecs — **per container** (authoritative from source)
From `src/get-available-audio-codecs.ts` — union `['opus','aac','wav']`, mapped:
- `mp4` → `['aac']`
- `webm` → `['opus']`
- `wav` → `['wav']` (i.e. PCM)

> Note: an early docs blurb said "Currently only 'opus' supported" for audio — that is **stale**; the
> source shows `aac` (mp4), `opus` (webm), `wav/pcm` (wav). Trust the source. **No MP3/FLAC/Vorbis
> encode.**

### 3.5 Decode-side codecs
Decoding is whatever the browser's `VideoDecoder`/`AudioDecoder` can configure for the parsed track
(H.264/HEVC/VP8/VP9/AV1 video; AAC/Opus/MP3/FLAC/PCM/Vorbis audio, subject to browser support). The
package checks via `VideoDecoder.isConfigSupported()` / `AudioDecoder.isConfigSupported()` before
decoding, so unsupported codecs surface as `NA(browser)`. Safari historically lacked `AudioDecoder`
(noted in docs as of May 2025). Source: https://www.remotion.dev/docs/media-parser/webcodecs.

---

## 4. The documented BEST-PERFORMANCE path (§0.9)

What "this framework, at its best" means here:

1. **Hardware WebCodecs first.** Decoder and encoder configs set
   `hardwareAcceleration: 'prefer-hardware'`, with an automatic fallback to `'prefer-software'` if the
   browser rejects the hardware config. This is the framework's #1 perf lever and it is automatic — no
   flag for the adapter to set. Source: `src/video-decoder-config.ts`, `src/video-encoder-config.ts`.
   The docs' core pitch: *"WebCodecs have full access to GPU acceleration … vastly faster than
   WebAssembly-based processing."* https://www.remotion.dev/docs/webcodecs

2. **Streaming, backpressure-throttled pipeline (NOT batch).** The pipeline is parse → decode → encode,
   each step throttled to the next so samples don't pile up in front of the decoder ("traffic jam").
   The decoder/encoder helpers expose `waitForQueueToBeLessThan()` to await before pushing more. This
   is the documented way to avoid OOM and keep throughput high. `convertMedia` wires this internally.
   Source: https://www.remotion.dev/docs/media-parser/webcodecs ("connect the whole pipeline together
   and throttle each step"). **No fixed magic queue depth is documented** — it is driven by
   `decodeQueueSize`/`encodeQueueSize` + `waitForQueueToBeLessThan()` backpressure; record
   `queueDepth:'backpressure'` rather than a number.

3. **Resize / rotate backend = OffscreenCanvas 2D** (NOT WebGPU, NOT WebGL). `rotateAndResizeVideoFrame`
   creates `new OffscreenCanvas(w,h)`, `getContext('2d')`, applies `translate/rotate/scale`, then
   `drawImage(frame,0,0)` and reconstructs a `VideoFrame`. So the "best path" for scaling is **GPU
   decode/encode + 2D-canvas resampling** — there is no WebGPU/WebGL path to select. This is an honest
   limitation vs the §0.9 "WebGPU > WebGL > 2D" ladder: webcodecs sits at the **2D-canvas** rung for
   pixel work. Source: `src/rotate-and-resize-video-frame.ts`. (rotate applied **before** resize when
   both given — https://www.remotion.dev/docs/webcodecs/rotate-a-video.)

4. **Worker offload is partial.** Only **frame extraction** has a first-class Worker entry
   (`@remotion/webcodecs/worker` → `extractFramesOnWebWorker`). **`convertMedia` is NOT a worker
   function** — to keep a UI responsive you must call it inside a Worker you spawn yourself, or accept
   main-thread work (WebCodecs decode/encode itself is off-thread in the browser, but the JS
   orchestration/canvas resize is on the calling thread). Media-parser parsing can be moved off-thread
   with `parseMediaOnWebWorker`. Record this honestly in `configUsed`. Source: `src/worker.ts`, docs
   media-parser/workers.

5. **OPFS writer = default + fastest for large outputs.** `writer` defaults to `webFsWriter`
   (`@remotion/webcodecs/web-fs`, the Origin-Private File System) so output streams to disk rather than
   ballooning JS heap; `bufferWriter` (`./buffer`) keeps it all in memory (fine for small files, worse
   peak-mem). For the suite's in-memory `MediaBytes` contract, use `bufferWriter` for small/medium and
   note OPFS as the perf path for huge. Source: docs convert-media (`writer`), `exports` map.

6. **`expectedDurationInSeconds` / `expectedFrameRate`** — pass these for MP4 output so the `moov`
   metadata region is sized correctly in one pass (avoids a re-write). Defaults assume ~2 MB metadata /
   60 fps. Set them from the probe result. Source: docs convert-media.

**Recommended `configUsed` to record:**
```
{ backend:'webcodecs', hwAccel:'prefer-hardware(+software fallback)',
  pixelBackend:'offscreencanvas-2d', wasmThreads:0, pipeline:'streaming-backpressure',
  queueDepth:'waitForQueueToBeLessThan', writer:'bufferWriter|webFsWriter(opfs)',
  worker:'convert=main-thread; extractFrames/parse=worker-capable' }
```

---

## 5. Required headers / flags / Worker setup (§0.9, §8.5)

- **WebCodecs availability** is the hard gate: needs a Chromium-family browser with
  `VideoEncoder`/`VideoDecoder`/`AudioEncoder`/`AudioDecoder`. Brave (default test browser) qualifies.
  Feature-detect per browser → `NA(browser)` otherwise.
- **COOP/COEP / SharedArrayBuffer:** **NOT required** for `convertMedia` itself (no mt-WASM core; this
  is pure JS + native WebCodecs). The suite already serves with `COOP: same-origin` + `COEP:
  require-corp` (for ffmpeg.wasm + `measureUserAgentSpecificMemory`), which is harmless here and also
  lets OPFS/Workers run cross-origin-isolated. Docs note Workers "require COOP/COEP + SharedArrayBuffer
  for optimal performance," but that is about Worker messaging ergonomics, not a functional gate for
  conversion. Source: docs webcodecs overview.
- **License acknowledgement:** for free-tier eligibility the Remotion ecosystem expects you to declare
  eligibility (e.g. `licenseKey:'free-license'` / `acknowledgeRemotionLicense`-style flags on
  parse/render APIs). Telemetry was **removed from `@remotion/webcodecs` in v4.0.399**, so no network
  call is made at run time and there is **no CDN dependency** — good for §0.8 hermeticity. Set any
  required acknowledgement flag to silence console warnings; nothing phones home. Source: docs
  webcodecs/telemetry, docs/licensing.
- **No browser flags** needed in Brave/Chrome for the H.264/VP8/VP9/AAC/Opus paths. HEVC/AV1 may be
  unavailable depending on OS/browser build → `NA(browser)`.

---

## 6. How to VENDOR it LOCALLY (§0.8 — no CDN at run time)

This package is **trivially hermetic** — pure JS/TS, no WASM core, no run-time fetch (telemetry removed
in 4.0.399). It is bundled by the app's normal bundler from `node_modules`; nothing is loaded from a CDN.

1. **Install (bun only):**
   ```
   bun add @remotion/webcodecs@4.0.479 @remotion/media-parser@4.0.479
   ```
   Pin BOTH to the **same exact** version, no `^` (Remotion's documented constraint to avoid version
   conflicts across `@remotion/*`). Source: npm registry (`@remotion/media-parser` is the sole dep) +
   docs install notes.
2. **Import from the package** — `import { convertMedia, webcodecsController, getAvailableContainers,
   getAvailableVideoCodecs, getAvailableAudioCodecs, canCopyVideoTrack, rotateAndResizeVideoFrame }
   from '@remotion/webcodecs';` and `import { parseMedia, mediaParserController } from
   '@remotion/media-parser';`. Vite/bun resolves these from `node_modules` and bundles them with the
   app, served same-origin. No `vendor/` copy step is strictly required (it is ESM, no WASM blob), but
   if you mirror into `src/engines/remotion-webcodecs/vendor/` per the repo's `.gitignore`-vendor
   convention, copy `dist/esm/*.mjs` for both packages.
3. **Writer subpaths** are served same-origin too: `@remotion/webcodecs/web-fs` (OPFS) and
   `@remotion/webcodecs/buffer` (in-memory). The Worker entry `@remotion/webcodecs/worker` is only
   needed if you use `extractFramesOnWebWorker`; bundle it as a Worker via Vite's `?worker`/`new
   Worker(new URL(...))` pattern, still same-origin.
4. **No `toBlobURL`, no unpkg, no @ffmpeg/core-style heavy download.** The "30 MB WASM core" concern
   does not apply — total shipped JS is small (unpacked tarball ≈ 565 KB *source*, tree-shaken at
   build). The relevant §A.14 metric is **bundle size**, not download-a-core.

---

## 7. Honest limits (these become `NA(engine)` / `-`)

- **Only 3 output containers**: `mp4`, `webm`, `wav`. No MOV/MKV/TS/OGG/ADTS/MP3 **output** → `-` for
  those `containersOut` and every remux/mux case targeting them.
- **No `mux()` from external `EncodedTracks`** — there is no public muxer fed by arbitrary pre-encoded
  chunks; muxing is internal to `convertMedia(src)`. → `NA(engine)` for the suite's `mux` op.
- **No `trim`/cut** (documented "soon", not shipped); **no concat/splice**; **no crop**; **no
  compress** preset. → `NA(engine)` for trim, concat, crop cases.
- **No decrypt** (CENC ctr/cbcs, HLS-AES, ClearKey). HLS `.m3u8` is readable as a container but DRM is
  out of scope. → `NA(engine)` for all encryption cases.
- **No AV1 encode, no ProRes encode** (encode union is `vp8/vp9/h264/h265` only). HEVC(h265)/and any
  AV1 *decode* are browser-gated → `NA(browser)` where unconfigurable.
- **No MP3/FLAC/Vorbis encode** (encode audio union is `opus/aac/wav` only).
- **Pixel transforms limited to resize + rotate(90°-multiples)**, done on **OffscreenCanvas 2D** — no
  flip, no crop/pad, no fps interpolation, no color-space convert, no HDR→SDR tone-map, no fan-out/ABR
  ladder as a built-in (`convertMedia` is one `container`/codec per call; ABR = N calls). → `-` for
  those §A.8 rows. Alpha: VP8/VP9 alpha pass-through depends on browser decode/encode, not a documented
  feature → treat as `NA`/runtime-detect.
- **No metadata/tag WRITE** (no API to set tags/chapters on output) → `-` for §A.11 write-tags.
- **`convertMedia` is not a Worker function** — only frame extraction has a Worker entry. Conversion
  orchestration runs on the calling thread (WebCodecs codecs themselves are off-thread in-browser).
- **Experimental + deprecating** — API may change; Remotion steering users to **Mediabunny** (this
  suite's reference). A real maintenance risk to record in the report's caveats.
- **Subtitles / data tracks**: not handled by the converter → `-` for §A.13.

---

## 8. Appendix A coverage (which rows it supports)

Legend: ✅ supported & in-scope · ⚠️ partial/conditional · ❌ `NA(engine)` (`-`) · 🅱️ may be `NA(browser)`.

- **A.1 Input sources & reading modes** — ✅ `File`/`Blob`/`ArrayBuffer`/URL; ✅ **HTTP Range / partial
  lazy read** + ✅ **streaming input** + custom `reader` (via media-parser). Strong on "read without
  loading whole file."
- **A.2 Containers READ (demux/probe)** — ✅ mp4, mov, mkv, webm, ts, hls(m3u8), avi, mp3, wav, flac,
  aac/m4a (via media-parser). ❌ AIFF, CAF, FLV, OGG, GIF-as-video, 3GP (not in the documented input
  list).
- **A.3 Containers WRITE (mux)** — ⚠️ only **mp4** (progressive; `expectedDuration` sizes moov),
  **webm**, **wav**. ❌ fragmented/CMAF, mov, mkv, ts, ogg, adts, mp3, fastStart-reserve. Streaming
  write target ✅ via OPFS `webFsWriter`.
- **A.4 Video DECODE** — ✅ H.264/VP8/VP9 (+ HEVC/AV1 🅱️ browser-gated), via WebCodecs `VideoDecoder`.
  (Parser identifies codecs; decode produces pixels via `extractFrames`/`createVideoDecoder`.)
- **A.5 Video ENCODE** — ⚠️ **H.264, HEVC(h265), VP8, VP9 only**. ❌ AV1, ❌ 10-bit/HDR10 (no
  documented support).
- **A.6 Audio DECODE & ENCODE** — DECODE ✅ AAC/Opus/MP3/FLAC/PCM/Vorbis (browser-dependent, 🅱️ Safari
  AudioDecoder gaps). ENCODE ⚠️ **AAC (mp4), Opus (webm), PCM/WAV (wav) only**; ❌ MP3/FLAC/Vorbis
  encode. PCM big-endian/24-bit encode: not documented → ❌.
- **A.7 Core ops** — probe ✅, demux/iterate-packets ✅, decode-frames ✅, seek ✅ (keyframe via
  media-parser controller), remux ⚠️ (copy-tracks, only to mp4/webm/wav), transcode ✅, trim ❌,
  concat/splice ❌, mux(from external tracks) ❌, extract-audio ⚠️ (→ wav only), replace/swap audio ❌,
  decrypt ❌, thumbnail/frame-at-time ✅ (`extractFrames`), fragmentation/MSE-segments ❌.
- **A.8 Video transforms** — ✅ resize (6 modes), ✅ rotate (90° multiples, display-matrix aware). ❌
  flip, crop/pad/letterbox, fps change/interpolate, color-space convert, HDR→SDR, fan-out/ABR. ⚠️ alpha
  preservation (browser-dependent, undocumented).
- **A.9 Audio transforms / DSP** — ⚠️ partial: `convertAudioData` / `getPartialAudioData` (resample,
  channel handling, PCM format convert to WAV). ❌ explicit volume/gain/fade options.
- **A.10 Output / streaming modes** — ✅ buffer (`bufferWriter`), ✅ streaming target (OPFS
  `webFsWriter`). ❌ fragmented/CMAF, ❌ fastStart-reserve, ❌ tiny-chunk/188-byte TS, ❌ MSE segment
  generation.
- **A.11 Metadata/tags/structure** — ✅ READ duration/dims/fps/sample-rate/channels/rotation/tracks
  (via media-parser); ⚠️ multi-track + selection (parser-side); ❌ WRITE tags/chapters/edit-lists.
- **A.12 Encryption/DRM** — ❌ all (no decrypt API).
- **A.13 Subtitles/text/data tracks** — ❌ (converter doesn't expose text/data tracks).
- **A.14 Performance dimensions** — ✅ contests extract-metadata ops/s (parse), iterate-packets
  packets/s, convert-to-WebM+resize-320×180 frames/s (its headline strength), decode fps, encode fps,
  seek ms/seek, time-to-first-frame, **load/init time** (tiny — pure JS, no WASM compile), peak memory,
  longtask ms, **bundle size** (small), source-reads/range-fetches (lazy via Range). This is the
  package's best dimension — GPU-accelerated convert is its raison d'être.
- **A.15 Developer/platform** — ✅ TS types, ⚠️ one runtime dep (`@remotion/media-parser`),
  ✅ tree-shakeable ESM, ⚠️ Worker (only frame-extract + parse, not convert), ❌ needs
  SharedArrayBuffer (does NOT), ✅ hardware-accelerated WebCodecs, ❌ WebGPU/WebGL (uses 2D canvas),
  ⚠️ Remotion License (free ≤3 people / company license otherwise).
- **A.16 Deep edge cases** — ⚠️ open-GOP/B-frame reorder (parser handles), VFR, rotation (matrix-aware),
  multi-track select, headerless MediaRecorder WebM (there's a dedicated "Fix a MediaRecorder video"
  guide → ✅ should report sane duration), big-endian/24-bit PCM (read maybe, encode ❌), MP3 Xing-TOC
  vs CBR duration (parser-side), FLAC ±SEEKTABLE seek (parser-side), zero-length/truncated/fuzzed (must
  fail gracefully — typed `VideoUndecodableError`/`AudioUndecodableError` help), image negatives (must
  `NA`/throw cleanly), seek-past-EOF. Metamorphic invariants apply to its supported ops only (decode∘
  remux, probe∘remux duration, etc.).

---

## 9. Documentation URLs cited

- Overview / inputs-outputs / phase-out / license / "soon: trim,crop,compress": https://www.remotion.dev/docs/webcodecs
- `convertMedia()` params + return + `save()`: https://www.remotion.dev/docs/webcodecs/convert-media
- Convert-a-video guide: https://www.remotion.dev/docs/webcodecs/convert-a-video
- Track transformation (onVideoTrack/onAudioTrack copy/reencode/drop/fail): https://www.remotion.dev/docs/webcodecs/track-transformation
- Resize (6 ResizeOperation modes): https://www.remotion.dev/docs/webcodecs/resize-a-video
- Rotate (90° multiples, rotate-before-resize): https://www.remotion.dev/docs/webcodecs/rotate-a-video
- rotateAndResizeVideoFrame: https://www.remotion.dev/docs/webcodecs/rotate-and-resize-video-frame
- webcodecsController (pause/resume/abort): https://www.remotion.dev/docs/webcodecs/webcodecs-controller
- Telemetry removed v4.0.399: https://www.remotion.dev/docs/webcodecs/telemetry
- media-parser + WebCodecs (pipeline/backpressure/waitForQueueToBeLessThan): https://www.remotion.dev/docs/media-parser/webcodecs
- media-parser parseMedia (fields, reader, controller): https://www.remotion.dev/docs/media-parser/parse-media
- media-parser fast/slow fields: https://www.remotion.dev/docs/media-parser/fast-and-slow
- media-parser seeking (keyframe seek, slowDuration restriction): https://www.remotion.dev/docs/media-parser/seeking
- media-parser workers (parseMediaOnWebWorker): https://www.remotion.dev/docs/media-parser/workers
- License & pricing: https://www.remotion.dev/docs/license , https://www.remotion.dev/docs/licensing
- Source — index.ts (export surface): https://github.com/remotion-dev/remotion/blob/main/packages/webcodecs/src/index.ts
- Source — get-available-video-codecs.ts / get-available-audio-codecs.ts (codec maps): https://github.com/remotion-dev/remotion/tree/main/packages/webcodecs/src
- Source — video-decoder-config.ts / video-encoder-config.ts (prefer-hardware): https://github.com/remotion-dev/remotion/tree/main/packages/webcodecs/src
- Source — rotate-and-resize-video-frame.ts (OffscreenCanvas 2D): https://github.com/remotion-dev/remotion/blob/main/packages/webcodecs/src/rotate-and-resize-video-frame.ts
- npm registry (version 4.0.479, deps, exports, license): https://registry.npmjs.org/@remotion/webcodecs/latest , https://www.npmjs.com/package/@remotion/webcodecs

---

## 10. Bottom line for the adapter author

Declare capabilities **honestly small but sharp**: `operations: { probe, demux, decodeFrames, seek,
remux, transcode }` (NO mux/trim/decrypt). `containersOut: ['mp4','webm','wav']`. `videoCodecs`
encode-side `['h264','hevc','vp8','vp9']`; `audioCodecs` encode-side `['aac','opus','pcm-s16'(wav)]`.
`features: ['resize','rotate','webcodecs:independent'? NO — it DOES route through WebCodecs so it stays
on the browser-codec gate]`. Drive it via `convertMedia({src,container,videoCodec,audioCodec,resize,
rotate,controller,onProgress,writer:bufferWriter})` then `await result.save()`; probe/demux/seek via
`@remotion/media-parser`. Record `configUsed` = hardware WebCodecs + OffscreenCanvas-2D resize +
streaming-backpressure pipeline + (convert on calling thread). Its headline win is **GPU-accelerated
convert-to-WebM-resize-320×180 frames/s** — exactly the §8.1 case it should be competitive on against
Mediabunny.
