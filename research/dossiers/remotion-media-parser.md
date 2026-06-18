# Dossier — `@remotion/media-parser`

> Engine id: `remotion-media-parser` · npm: `@remotion/media-parser` · researched **2026-06-17**
> Docs root: https://www.remotion.dev/docs/media-parser/
> Source: https://github.com/remotion-dev/remotion/tree/main/packages/media-parser

---

## 0. TL;DR / kind

`@remotion/media-parser` is a **pure-TypeScript, zero-dependency, streaming container parser** for the
browser, Node and Bun. It is a **read-only demuxer + metadata extractor**: it identifies the container,
reads metadata (duration/dimensions/fps/codecs/rotation/HDR/tags/keyframes/location/embedded images),
and **emits encoded packets** (`MediaParserVideoSample` / `MediaParserAudioSample`) whose shape is
deliberately compatible with the WebCodecs `EncodedVideoChunk` / `EncodedAudioChunk` constructors.

It contains **no codecs and no muxer**: it does **not decode, encode, remux, transcode, trim, mux, or
decrypt**. Pixel/PCM output, re-encoding and container writing are explicitly delegated to WebCodecs
(decode) and to a separate library (`@remotion/webcodecs` / Mediabunny) for write. Source overview:
"Media Parser is explicitly not designed for encoding or decoding — it only parses files."
(https://www.remotion.dev/docs/media-parser/)

In this benchmark suite it competes on the **read side** of Appendix A: probe/extract-metadata (A.7),
demux/iterate-packets (A.2/A.7), metadata read (A.11), seek-to-keyframe (A.7), HLS/M3U8 stream
selection, and the read-path edge cases (A.16). It scores **`-` (NA-engine)** on every encode / mux /
remux / transcode / trim / decrypt row because the library genuinely cannot do them.

### ⚠️ DEPRECATION (record honestly in the report)
As of **2026-02-01** the Remotion team **deprecated** Media Parser and recommends migrating to
**Mediabunny** (the suite's reference engine). The README/blog: "As of February 1st 2026, Media Parser
is now deprecated! We recommend migrating to Mediabunny… We're going to phase out Remotion Media Parser
and Remotion WebCodecs and help Mediabunny become the go-to multimedia toolkit for the web."
(https://www.remotion.dev/blog/media-parser). It is still installable and functional at v4.0.479 and the
metadata API is documented as production-stable, so it remains a legitimate contender; the deprecation is
a **developer-aspect (A.15) caveat**, not a functional disqualification.

---

## 1. Latest version

- **`@remotion/media-parser@4.0.479`** — confirmed via `bun add @remotion/media-parser` and the
  installed `dist/version.js` (`exports.VERSION = '4.0.479'`) on 2026-06-17.
- `parseMedia()` itself has existed since **v4.0.190**; `simulateSeek()` since **v4.0.312**
  (https://www.remotion.dev/docs/media-parser/parse-media, https://www.remotion.dev/docs/media-parser/seeking).
- Versioning is locked to the Remotion monorepo — **all `remotion` / `@remotion/*` packages must share
  the exact same version**, pinned without `^` (https://www.npmjs.com/package/@remotion/media-parser).
- `package.json`: `dependencies: {}`, `peerDependencies: {}` → **truly zero runtime deps** (verified
  on disk).

---

## 2. Recommended API per operation

Public entry points (verified in `dist/index.d.ts`):
`parseMedia`, `downloadAndParseMedia`, `mediaParserController`, `hasBeenAborted`,
`WEBCODECS_TIMESCALE`, error classes (`IsAnImageError`, `IsAPdfError`,
`IsAnUnsupportedFileTypeError`, `MediaParserAbortError`), plus worker entries
`parseMediaOnWebWorker` (`/worker`) and `parseMediaOnServerWorker` (`/server-worker`), and readers
`webReader` (`/web`), `nodeReader` (`/node`), `universalReader` (`/universal`).

| Op | Supported? | Recommended API | Notes / citation |
|---|---|---|---|
| **probe / extract-metadata** | ✅ | `parseMedia({ src, fields:{ durationInSeconds, dimensions, fps, videoCodec, audioCodec, container, rotation, numberOfAudioChannels, sampleRate, tracks, isHdr, metadata, … } })` | Request only the fields you need; the parser reads as little as possible. https://www.remotion.dev/docs/media-parser/parse-media , /docs/media-parser/fields |
| **demux / iterate-packets** | ✅ | `parseMedia({ src, onVideoTrack: ({track,container}) => (sample)=>{…}, onAudioTrack: ({track})=>(sample)=>{…} })` — returning a per-sample callback triggers **full demux**; the sample is `EncodedVideoChunk`-compatible | https://www.remotion.dev/docs/media-parser/webcodecs ; returning `null` keeps it metadata-only |
| **decode-frames (→ pixels)** | ❌ NA(engine) | — | No decoder. Pair the emitted samples with WebCodecs `VideoDecoder` yourself; that decode is the platform/WebCodecs engine's job, not this library's. https://www.remotion.dev/docs/media-parser/ |
| **encode** | ❌ NA(engine) | — | No `VideoEncoder`/`AudioEncoder` anywhere in `dist` (verified by grep). |
| **remux** | ❌ NA(engine) | — | No muxer/container writer. |
| **transcode** | ❌ NA(engine) | — | No encode + no mux. |
| **trim / cut** | ❌ NA(engine) | — | Can *seek/read* a range but cannot write an output container. (`controller.seek()` reads, not writes.) |
| **mux** | ❌ NA(engine) | — | No write path; `node-writer`/`writers` only persist a *downloaded* file to disk in `downloadAndParseMedia`, they do not author media. |
| **decrypt (CENC/HLS-AES)** | ❌ NA(engine) | — | No decryption code (no senc/cenc/cbcs/AES handling). It can *parse* an encrypted container's boxes but returns encrypted samples; it does not produce plaintext. |
| **seek (keyframe)** | ✅ (read-side) | `const c = mediaParserController(); parseMedia({ src, controller:c, … }); c.seek(seconds)` → lands on **the best keyframe at/just before the requested time**; `await c.simulateSeek(s)` previews the resolution without committing | https://www.remotion.dev/docs/media-parser/seeking |

### Minimal probe example (suite's probe path)
```ts
import { parseMedia } from '@remotion/media-parser';
import { webReader } from '@remotion/media-parser/web';

const { durationInSeconds, dimensions, fps, videoCodec, audioCodec, container, rotation } =
  await parseMedia({
    src: '/fixtures/media/h264_1080p_30s.mp4', // string URL | Blob | File | URL
    reader: webReader,                          // default in browser; can be omitted
    acknowledgeRemotionLicense: true,
    fields: {
      durationInSeconds: true, dimensions: true, fps: true,
      videoCodec: true, audioCodec: true, container: true, rotation: true,
    },
  });
```

### Demux / packet-iteration example (suite's demux path)
```ts
import { parseMedia } from '@remotion/media-parser';

let videoPackets = 0;
await parseMedia({
  src: input,
  onVideoTrack: ({ track }) => {
    // returning a per-sample callback => FULL demux of this track
    return (sample /* MediaParserVideoSample */) => {
      videoPackets++;
      // sample.data:Uint8Array, sample.timestamp, sample.duration,
      // sample.type:'key'|'delta', sample.decodingTimestamp, sample.offset, sample.avc?
    };
  },
  onAudioTrack: () => null, // skip audio
});
```
Each sample maps 1:1 to the suite's `PacketInfo`: `sample.type === 'key'` is the keyframe flag,
`sample.data.byteLength` is the size, `sample.timestamp` / `sample.decodingTimestamp` give PTS/DTS in
microseconds (`timescale: 1_000_000`, the `WEBCODECS_TIMESCALE` constant), and `sample.avc`
(`{type:'keyframe'|'delta-frame', isBidirectionalFrame, poc}`) gives B-frame / reorder info for the
open-GOP edge case (A.16). Verified in `dist/webcodec-sample-types.d.ts`.

---

## 3. Documented BEST-PERFORMANCE path (§0.9)

This is a **CPU/JS streaming parser** — there is **no WebGPU / WebGL / hardware-codec / multi-threaded
WASM** path because it does no pixel work and ships no WASM. Its "fast path" is about **reading as few
bytes as possible** and **keeping the main thread free**.

1. **Ask for the fewest, fastest fields.** The parser classifies work into three tiers
   (https://www.remotion.dev/docs/media-parser/fast-and-slow):
   - **Header-only (fastest):** `name`, `size`, `container`, `mimeType`.
   - **Metadata-only (fast):** `dimensions`, `durationInSeconds`, `fps`, `videoCodec`, `audioCodec`,
     `tracks`, `unrotatedDimensions`, `rotation`, `isHdr`, `location`, `sampleRate`,
     `numberOfAudioChannels`, `keyframes`, `metadata`, `images`, `m3uStreams`.
   - **Full-parse (slow, reads the whole file):** `slowStructure`, `slowKeyframes`, `slowFps`,
     `slowDurationInSeconds`, `slowNumberOfFrames`, `slowAudioBitrate`, `slowVideoBitrate`.
   For the `perf/extract-metadata` headline case, request only metadata-tier fields → it does **not**
   read the whole file. (Returning a sample callback from `onVideoTrack`/`onAudioTrack` forces a full
   demux — that is correct for `perf/iterate-video-packets` but must be avoided for pure probe.)
2. **HTTP Range / lazy reads (A.1).** For URL sources the default `webReader` issues **HTTP Range
   requests** and parses `Content-Range` (verified in `dist/readers/from-fetch.js`:
   `parseContentRange`, `validateContentRangeAndDetectIfSupported`). It reads only the bytes needed and
   detects whether the server supports ranges. Docs: "make sure [the server] supports the Range header.
   Otherwise … no choice but to read the full file if the metadata is at the end."
   (https://www.remotion.dev/docs/media-parser/fast-and-slow). In the suite, the Vite fixtures
   middleware must serve `fixtures/**` with Range support so this lazy path is exercised — this directly
   improves the `source-reads / range-fetches` metric (A.14).
3. **Worker offload (keeps `longtask` ≈ 0).** Use **`parseMediaOnWebWorker`** from
   `@remotion/media-parser/worker` to run parsing on a Web Worker so the main thread stays unblocked
   (https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker). Caveat: on the worker the
   **`reader` option is unavailable** (a function can't be postMessage'd) — it is hardcoded to
   `webReader`, so worker mode handles **URL / File / Blob** sources (which fits the suite's static
   fixtures). The controller (`mediaParserController`) and all async callbacks still work across the
   worker boundary. This is the documented fastest *responsiveness* path; the `init()` (worker spawn) is
   untimed per §0.7.
4. **Async-callback back-pressure (streaming pipeline, A.10-read-side).** Returning a `Promise` from a
   sample callback **pauses parsing until it resolves** — natural back-pressure when piping samples into
   a slower consumer (e.g. a WebCodecs decoder): "As long as they don't resolve, the parsing process
   will not continue." (https://www.remotion.dev/docs/media-parser/webcodecs). Keep callbacks
   synchronous/cheap when you want maximum packet throughput for `perf/iterate-video-packets`.
5. **No SharedArrayBuffer needed.** `grep` over `dist` finds **no `SharedArrayBuffer` / `Atomics`**
   usage anywhere → COOP/COEP cross-origin isolation is **not required** for this engine (it can still
   run under the suite's isolated headers; it just doesn't need them). The worker uses ordinary
   `postMessage` + structured clone.

### `configUsed` to record per run (§8.5)
```jsonc
{
  "backend": "cpu-js",          // pure-JS parser, no GPU/WASM
  "hwAccel": false,
  "wasmThreads": 0,
  "pipeline": "streaming",       // Range-based progressive reads + async-callback back-pressure
  "worker": true,                // parseMediaOnWebWorker for main-thread offload
  "reader": "webReader",         // HTTP-Range lazy reads (worker forces webReader)
  "fieldsTier": "metadata-only", // for probe; "full-parse(demux)" for packet iteration
  "coreBuild": "n/a",
  "version": "4.0.479"
}
```

---

## 4. Required headers / flags / Worker setup

- **Browser flags / headers:** none required for the core parse path. **No COOP/COEP / SharedArrayBuffer
  requirement** (no SAB/Atomics in the bundle). It runs in plain (non-isolated) contexts and equally
  under the suite's isolated headers.
- **Range header on the server:** the fixtures server **must** serve media with HTTP Range support so
  the lazy/streaming path activates; otherwise the parser falls back to reading the full file when
  metadata is trailing (https://www.remotion.dev/docs/media-parser/fast-and-slow).
- **Worker setup (important Vite gotcha):** `parseMediaOnWebWorker` constructs the worker via
  `new Worker(new URL("./worker-web-entry.mjs", import.meta.url))` (verified in
  `dist/esm/worker.mjs`). The library actively detects Vite pre-bundling and **throws** with the fix it
  needs, so the suite's `vite.config.mjs` MUST contain:
  ```js
  optimizeDeps: { exclude: ['@remotion/media-parser/worker'] }
  ```
  (exact string emitted by the library's guard). Vite then bundles `worker-web-entry.mjs` as a local
  same-origin worker chunk — satisfying §0.8 with no extra config.
- **Min browser versions** (parse path): Chrome/Edge 111, Safari 16.4, Firefox 128; Node ≥ 20, Bun ≥ 1.
  Feature gate the docs give: `typeof fetch === 'function' && typeof new ArrayBuffer().resize ===
  'function'` (resizable ArrayBuffer). (https://www.remotion.dev/docs/media-parser/runtime-support).
  Brave (Chromium-based, current) satisfies this. **WebCodecs is a separate, later gate** and is only
  needed if you decode the emitted samples — not for parsing itself.

---

## 5. How to VENDOR it LOCALLY (§0.8 — no CDN at run time)

The library is pure JS/TS with **zero deps and no WASM** (no `.wasm` files in `dist`, verified), which
makes local hosting trivial — there is no heavy core to fetch at run time.

1. **Install:** `bun add @remotion/media-parser` (pins `4.0.479`). It lands in `node_modules/` and is
   imported by source; Vite bundles it into the local-origin app bundle. Nothing is fetched from a CDN.
2. **Imports used by the adapter:**
   - `import { parseMedia, mediaParserController, hasBeenAborted, IsAnImageError, IsAPdfError,
     IsAnUnsupportedFileTypeError } from '@remotion/media-parser';`
   - `import { webReader } from '@remotion/media-parser/web';`
   - (worker fast path) `import { parseMediaOnWebWorker } from '@remotion/media-parser/worker';`
3. **Worker chunk:** the only "extra file" is the worker entry `worker-web-entry.mjs`. Vite resolves it
   from `import.meta.url` and emits it as a hashed **same-origin** chunk automatically — **provided**
   `optimizeDeps.exclude` contains `'@remotion/media-parser/worker'` (see §4). No manual copy to a
   `vendor/` dir is necessary; if you prefer an explicit committed-by-reference copy, copy
   `node_modules/@remotion/media-parser/dist/esm/` into `src/engines/remotion-media-parser/vendor/` and
   import from there. Either way it is served from the local origin.
4. **No `toBlobURL` / unpkg.** Unlike ffmpeg.wasm, there is no run-time WASM fetch to neutralize.
5. **Bundle facts (A.14):** raw ESM `dist/esm/index.mjs` ≈ **515 kB** (≈ **99 kB gzipped**). A
   tree-shaken `parseMedia + webReader` entry built with `bun build --minify --target=browser` is
   ≈ **262 kB minified ≈ 70.8 kB min+gzip** (measured 2026-06-17). The suite's per-engine offline
   bundle build should report this; it is a *bundle-size* fact only and is excluded from op timings
   (§0.7).

---

## 6. Honest limits → these become `NA(engine)` / `-`

- **No decode** → no pixels; cannot satisfy any SSIM/PSNR or frame-digest oracle on its own
  (`decode-frames`, A.4). It emits encoded samples for *you* to decode via WebCodecs.
- **No encode** → A.5 (all video encode), A.6 (audio encode) = `-`.
- **No mux / no container writer** → A.3 (all write), `remux`, `mux` = `-`.
- **No transcode / no transforms** → A.8 (resize/rotate/crop/fps/bitrate/color/HDR-tonemap/alpha/
  fan-out) = `-`. (It *reports* rotation/HDR/alpha presence as metadata, but performs no pixel op.)
- **No trim/cut output** → A.7 trim = `-` (it can seek-read a range but cannot author the trimmed file).
- **No DSP** → A.9 (resample/channel-mix/PCM-convert/gain/fade) = `-`.
- **No decryption** → A.12 (CENC ctr/cbcs, HLS-AES, ClearKey) = `-`. (Encrypted samples come out
  encrypted; the "leave-unencrypted-untouched" negative is trivially satisfied since it never decrypts.)
- **No subtitle/text extraction** → A.13: non-A/V tracks surface only as `MediaParserOtherTrack`
  (`type:'other'`, no text payload) → text-track read/write = `-`.
- **Container coverage gaps vs Appendix A.2:** the typed `MediaParserContainer` union is
  `'mp4' | 'webm' | 'avi' | 'transport-stream' | 'mp3' | 'aac' | 'flac' | 'm3u8' | 'wav'`
  (verified in `dist/options.d.ts`). MOV/MKV/M4A/3GP map onto mp4/webm/aac families; **but Ogg/OGV,
  AIFF-as-container, CAF, FLV, GIF-as-video are NOT in the container enum** → those probe/demux rows are
  `-`. (Note: `aiff` appears only as an *audio-codec* value, not a container.)
- **Worker reader restriction:** `parseMediaOnWebWorker` cannot accept a custom `reader` (functions
  aren't transferable) — it is fixed to `webReader`, so custom-`Source` plug-ins (A.1) only work on the
  main-thread `parseMedia`.
- **No raw `ReadableStream`/async-iterable `src`:** `ParseMediaSrc = string | Blob | URL` (verified).
  `File` works (extends `Blob`); a bare `ReadableStream` is **not** a valid `src` (streaming is internal
  via Range/fetch, not a caller-supplied stream).
- **Deprecated (2026-02-01):** maintenance is winding down in favor of Mediabunny — record as an A.15
  developer-aspect caveat (https://www.remotion.dev/blog/media-parser).
- **Forward-seek restriction:** seeking forward is disallowed when a field requiring full sample
  iteration is in flight (it throws) — see `disallow-forward-seek-if-samples-are-needed` in `dist`.

---

## 7. Appendix A coverage (read-side competitor)

| Row | Verdict | Note |
|---|---|---|
| **A.1 Input sources & reading modes** | ✅ partial | `File`/`Blob`, `ArrayBuffer` (wrap in Blob), URL + **HTTP Range** lazy reads, streaming-while-downloading, custom `Source`/reader (main thread only). Reads without loading whole file. No caller-supplied `ReadableStream` `src`. |
| **A.2 Containers — READ (demux/probe)** | ✅ subset | mp4/mov, fragmented-mp4/CMAF (via mfra), webm/mkv, MPEG-TS, HLS/m3u8, AVI, mp3, wav, aac/adts, flac, m4a. **NOT**: Ogg/OGV, CAF, FLV, AIFF-container, GIF-as-video → `-`. |
| **A.3 Containers — WRITE (mux)** | `-` | No muxer. |
| **A.4 Video codecs — DECODE** | `-` | Identifies h264/h265/vp8/vp9/av1/prores but renders no pixels → contests **packet-iteration** (A.7), not decode. |
| **A.5 Video codecs — ENCODE** | `-` | No encoder. |
| **A.6 Audio codecs — DECODE & ENCODE** | `-` for decode/encode | Identifies opus/aac/mp3/ac3/vorbis/flac/aiff/pcm-(u8,s16,s24,s32,f32) as codecs, but produces no PCM. |
| **A.7 Core operations** | ✅ probe, demux, seek; `-` rest | probe (ops/s), demux/iterate-packets (packets/s), seek-to-keyframe (ms/seek, via controller). decode/remux/transcode/trim/concat/mux/extract-audio/replace-audio/decrypt/thumbnail = `-`. Fragmentation/MSE-segments = `-` (read-only). |
| **A.8 Video transforms** | `-` | No pixel ops. Detects rotation/display-matrix, HDR flag, alpha presence as metadata only. |
| **A.9 Audio transforms / DSP** | `-` | No DSP. |
| **A.10 Output / streaming modes** | `-` (write); ✅ read-streaming | No write targets. Read side streams via Range. |
| **A.11 Metadata / tags / structure** | ✅ read; `-` write | Reads duration/dims/fps/sampleRate/channels/codecs/container/rotation/display-matrix/HDR/tracks+selection/location/embedded-images(cover-art)/ID3+EXIF tags (`metadata: MediaParserMetadataEntry[]`). **No tag WRITE** → write-tags = `-`. Chapters/edit-lists/timecode not surfaced as first-class fields. |
| **A.12 Encryption / DRM** | `-` | No decrypt. "Leave-unencrypted-untouched" trivially true (never decrypts). |
| **A.13 Subtitles / text / data tracks** | `-` | Non-A/V tracks are `type:'other'` with no text payload; no write. |
| **A.14 Performance dimensions** | ✅ for its ops | Contests **extract-metadata ops/s**, **iterate-video-packets packets/s**, **seek ms/seek**, **time-to-first-byte/first-frame-of-metadata**, **load/init ms** (tiny — JS only), **peak memory**, **longtask ms** (≈0 in worker mode), **bundle size** (~70.8 kB min+gzip), **source-reads/range-fetches** (low = lazy). Not eligible for decode/encode fps. |
| **A.15 Developer / platform aspects** | ✅ (scored) | First-class **TypeScript types**, **zero runtime deps**, tree-shakeable ESM, runs in a **Worker**, **does NOT need SharedArrayBuffer/COOP+COEP**, **not** hardware-accelerated, **no** WebGPU/WebGL. License: Remotion license (note the `acknowledgeRemotionLicense` flag) — record license terms. **Deprecated 2026-02-01.** |
| **A.16 Deep edge cases** | ✅ read-side robustness | Open-GOP/B-frame reorder (via `sample.avc.isBidirectionalFrame`/`poc`), VFR (nominal `fps` vs `slowFps`), rotation matrix (`rotation` ≠ w/h swap, `unrotatedDimensions`), multi-track + non-default selection (`tracks[]`, per-track callbacks), **headerless MediaRecorder WebM** (must report a sane duration — test `durationInSeconds` vs `slowDurationInSeconds`), big-endian/24-bit PCM (`pcm-s24`/`aiff` codec enums), MP3 Xing-TOC vs CBR-no-TOC duration, FLAC ±SEEKTABLE seek accuracy, fragmented/CMAF init+media split, multi-hour/many-sample (streaming), **zero-length / truncated / bit-flipped** → must **throw cleanly** (`IsAnUnsupportedFileTypeError` etc., never crash/hang), image-negatives → `IsAnImageError`, PDF → `IsAPdfError`. **Metamorphic invariants involving write/transcode (`decode(remux(x))`, `demux(mux(x))`, `trim ++ trim`) are NA** (no write); **`probe(x).dur` consistent across containers** IS testable. |

---

## 8. Suite wiring cheat-sheet (for the adapter author — not implemented here)

- **`capabilities()`** should declare:
  - `operations: ['probe','demux','seek']` (and `metadata:read` via features).
  - `containersIn: ['mp4','mov','webm','mkv','avi','transport-stream','m3u8','mp3','wav','aac','m4a','flac']`
    (mov/mkv/m4a map onto mp4/webm/aac families).
  - `containersOut: []`.
  - `videoCodecs: ['h264','h265','vp8','vp9','av1','prores']` (parse/identify only).
  - `audioCodecs: ['aac','mp3','opus','vorbis','flac','ac3','aiff','pcm-u8','pcm-s16','pcm-s24','pcm-s32','pcm-f32']`
    (parse/identify only).
  - `encryption: []`.
  - `features: ['metadata:read','rotate:detect','hdr:detect','keyframes','http-range','streaming-read','worker','webcodecs:samples']`.
    Add `'webcodecs:independent'`? **No** — its samples are *meant* to flow into WebCodecs for any pixel
    verification, but parsing itself needs no browser codec, so probe/demux do not need the codec gate;
    decode-dependent oracles do.
- **`init()` (untimed, §0.7):** spawn the web worker (`parseMediaOnWebWorker` lazy-imports it) and/or
  prime `mediaParserController`. There is no WASM compile or encoder warmup.
- **probe case:** `parseMedia({src, reader:webReader, fields:{…metadata-tier…}})` → map to
  `NormalizedMetadata`. Keep to metadata-tier fields for `perf/extract-metadata` (don't trigger full
  parse).
- **demux case:** `onVideoTrack`/`onAudioTrack` returning a sample callback → count packets / collect
  `PacketInfo{ size:data.byteLength, keyframe:type==='key', pts:timestamp, dts:decodingTimestamp }`
  for the golden-packets oracle (A.7). Use the worker entry for `perf/iterate-video-packets` to keep
  `longtask` low; or main-thread `parseMedia` if a custom reader is needed.
- **seek case:** `mediaParserController().seek(t)` (+ `simulateSeek(t)` to assert the resolved
  keyframe), gated against the golden keyframe expectation.

---

## 9. Sources (all consulted 2026-06-17)

- Overview: https://www.remotion.dev/docs/media-parser/
- `parseMedia()`: https://www.remotion.dev/docs/media-parser/parse-media
- Available fields: https://www.remotion.dev/docs/media-parser/fields
- Fast & slow operations: https://www.remotion.dev/docs/media-parser/fast-and-slow
- WebCodecs integration (demux→decode): https://www.remotion.dev/docs/media-parser/webcodecs
- Web Worker: https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker
- Server worker: https://www.remotion.dev/docs/media-parser/parse-media-on-server-worker
- Seeking: https://www.remotion.dev/docs/media-parser/seeking
- Metadata: https://www.remotion.dev/docs/media-parser/metadata
- TypeScript types: https://www.remotion.dev/docs/media-parser/types
- Foreign file types (errors): https://www.remotion.dev/docs/media-parser/foreign-file-types
- Runtime support: https://www.remotion.dev/docs/media-parser/runtime-support
- nodeReader: https://www.remotion.dev/docs/media-parser/node-reader
- webReader: https://www.remotion.dev/docs/media-parser/web-reader
- downloadAndParseMedia: https://www.remotion.dev/docs/media-parser/download-and-parse-media
- Deprecation / Mediabunny blog: https://www.remotion.dev/blog/media-parser
- npm: https://www.npmjs.com/package/@remotion/media-parser
- Source: https://github.com/remotion-dev/remotion/blob/main/packages/media-parser/src/parse-media.ts
- Local verification: `bun add @remotion/media-parser@4.0.479`, inspection of
  `dist/{index,options,get-tracks,webcodec-sample-types,errors,version}.d.ts`,
  `dist/esm/worker.mjs`, `dist/readers/from-fetch.js`; bundle measured with
  `bun build --minify --target=browser` + `gzip -c` on 2026-06-17.
