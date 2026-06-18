# Dossier — mediabunny (REFERENCE ENGINE)

> Research-first dossier per test-instructions.md §15. mediabunny is the **reference engine**;
> all Δ-vs-reference numbers are quoted against it. Every non-obvious claim is cited with a doc URL
> or a path inside the locally-installed package. Researched 2026-06-17.

## 0. Identity & version

- **npm package:** `mediabunny`
- **Latest published version:** **1.48.1** (released 2026-06-17), with 1.48.0 (2026-06-16) the previous minor.
  Cite: <https://github.com/Vanilagy/mediabunny/releases>
- **Version installed in this repo:** **1.48.0** (`node_modules/mediabunny/package.json` → `"version": "1.48.0"`).
  `package.json` declares `"mediabunny": "^1.0.0"`, so a `bun install` resolves to the latest 1.x; pin to a
  concrete version for reproducibility (rule §11).
- **License:** Mozilla Public License 2.0 (MPL-2.0). Cite: `node_modules/mediabunny/LICENSE`, <https://mediabunny.dev/>
- **Author:** Vanilagy (David P.). Repo: <https://github.com/Vanilagy/mediabunny>. Docs: <https://mediabunny.dev/>
- **Kind:** WebCodecs orchestrator — **pure TypeScript, zero runtime dependencies, no WebAssembly** in the core.
  Verified locally: `find node_modules/mediabunny -name "*.wasm"` returns **0** files. Cite:
  <https://mediabunny.dev/guide/introduction>

## 1. Architecture & why it is the reference

mediabunny is "a collection of multiplexers and demultiplexers, one of each for every container format,"
connected to the **WebCodecs API** via thin abstractions, with logic that is **heavily pipelined and lazy**
(automatic backpressure, on-demand reading). There is **no WASM sandbox and no CPU codec** — decode/encode
run on the same GPU video engine native apps use, through WebCodecs `VideoDecoder`/`VideoEncoder` /
`AudioDecoder`/`AudioEncoder`. PCM and container (de)muxing are pure JS.
Cite: <https://mediabunny.dev/guide/introduction>, <https://webcodecsfundamentals.org/projects/media-bunny/>

This is exactly the "best path" the suite wants every framework to be measured on (rule §0.9): hardware
WebCodecs over software, pipelined/streaming over batch, lazy/partial reads, transferable frames. mediabunny
is the reference because it natively embodies that path.

## 2. How to install & VENDOR LOCALLY (rule §0.8 — no CDN at run time)

- **Install (bun only, rule §0.5):** `bun add mediabunny` (already present in this repo).
- **It is ESM/TS source served from `node_modules`** — there is no WASM blob to fetch, no worker file to copy,
  no CDN `toBlobURL`. Importing `from 'mediabunny'` in the suite's bundle is fully local and hermetic.
  Cite: <https://mediabunny.dev/guide/installation>
- **Local artifacts present in the installed package** (all under `node_modules/mediabunny/dist/`):
  - `modules/src/index.js` (+ per-module `.js`/`.d.ts`) — the **tree-shakable ESM entry** Vite/the bundler
    will pull from; this is the recommended way to import for the suite.
  - `bundles/mediabunny.mjs` (1.3 MB) and `bundles/mediabunny.min.mjs` (630 KB) — single-file ESM builds for
    `<script type="module">` self-hosting.
  - `bundles/mediabunny.cjs` / `mediabunny.min.cjs` — UMD/global `<script src="mediabunny.cjs">` builds that
    expose a global `Mediabunny` object.
  - `mediabunny.d.ts` (210 KB) — single-file types; declares the global `Mediabunny` namespace for script-tag use.
  Cite: <https://mediabunny.dev/guide/installation>, <https://github.com/Vanilagy/mediabunny/releases>
- **Recommended vendoring for this suite:** import the ESM entry (`import { Input, Output, Conversion, ... }
  from 'mediabunny'`) so Vite tree-shakes and serves everything same-origin. No `src/engines/mediabunny/vendor/`
  copy is required because the package ships no run-time-fetched assets. If a committed `vendor/` is desired,
  copy `dist/bundles/mediabunny.min.mjs` + `dist/mediabunny.d.ts` and import the local file.
- **Extension packages (optional, see §8)** vendor the same way — each bundles its worker + WASM into a single
  file (no CDN / no `wasmPath`). Cite: <https://mediabunny.dev/guide/extensions/mp3-encoder>

## 3. Load/init phase (rule §0.7 — untimed)

What belongs in the adapter's `init()` (awaited before any timed window):
- Dynamic-`import('mediabunny')` so module parse/instantiate is excluded.
- **Warm WebCodecs feature-detection caches:** `await getEncodableVideoCodecs()`, `getDecodableVideoCodecs()`,
  `canEncodeVideo('avc',{...})`, etc. These calls build memoized maps (`canEncodeVideoMemo`,
  `canEncodeAudioMemo` exist in `encode.js`) and configure throw-away codecs; doing them in `init()` keeps the
  first measured op from paying the WebCodecs `isConfigSupported`/warm-up cost.
- Optionally register any extension encoders (`registerMp3Encoder()` etc.) once, gated on `canEncodeAudio(...)`.
- `dispose()` → call `input.dispose()` / `output.cancel()` and close any decoders/encoders to clean peak-memory.
  `Input` also supports `using input = new Input(...)` explicit resource management.
Cite (encode caches/feature-detect): `node_modules/mediabunny/dist/modules/src/encode.d.ts`;
(dispose/using): <https://mediabunny.dev/guide/reading-media-files>

## 4. Recommended API per operation (the adapter map)

All APIs are bytes/blobs/metadata/frames in → out, async, browser-native (matches the adapter contract §4).

### 4.1 probe / extract-metadata
- `const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })` (or `BufferSource`,
  `UrlSource`, `ReadableStreamSource`, `CustomSource`). Reading is **always lazy/partial** — only the bytes
  needed for the requested info are read.
- File-level: `await input.getFormat()`, `getMimeType()`, `computeDuration()`, `getDurationFromMetadata()`,
  `getFirstTimestamp()`, `getMetadataTags()`.
- Tracks: `getTracks()`, `getVideoTracks()`, `getAudioTracks()`, `getPrimaryVideoTrack()`,
  `getPrimaryAudioTrack()` (optional `InputTrackQuery` + `asc`/`desc`/`prefer` helpers).
- Per-track: `getCodec()`, `getCodecParameterString()`, `canDecode()`, `computeDuration()`,
  `getTimeResolution()`, `getLanguageCode()`, `getName()`, `computePacketStats(sampleSize?)` →
  `{ packetCount, averagePacketRate, averageBitrate }`.
- Video track: `getCodedWidth/Height()`, `getDisplayWidth/Height()`, `getRotation()` (0/90/180/270),
  `getPixelAspectRatio()`, `getColorSpace()`, `hasHighDynamicRange()`, `canBeTransparent()`,
  `getDecoderConfig()` (→ `VideoDecoderConfig`).
- Audio track: `getNumberOfChannels()`, `getSampleRate()`, `getDecoderConfig()`.
Cite: <https://mediabunny.dev/guide/reading-media-files>; `dist/modules/src/input.d.ts`, `input-track.d.ts`.

### 4.2 demux / iterate-packets
- `const sink = new EncodedPacketSink(track)`.
- Iterate: `for await (const packet of sink.packets(startPacket?, endPacket?, options?))` — intelligently
  preloads based on consumer speed (the fast path for packet iteration).
- Random access: `getFirstPacket()`, `getFirstKeyPacket()`, `getPacket(timestamp)`, `getNextPacket(packet)`,
  `getKeyPacket(timestamp)`, `getNextKeyPacket(packet)`.
- `PacketRetrievalOptions`: `metadataOnly` (sizes/timestamps without payload — fastest packet-count path),
  `verifyKeyPackets` (bitstream-verified keyframe flags), `skipLiveWait`.
- `EncodedPacket` → `data`, `type` ('key'|'delta'), `timestamp`/`duration` (+ `microsecondTimestamp`),
  `sequenceNumber`, `byteLength`, `toEncodedVideoChunk()`/`toEncodedAudioChunk()`,
  `EncodedPacket.fromEncodedChunk(chunk)`. → directly yields WebCodecs chunks for the platform/web-demuxer comparison.
Cite: `dist/modules/src/media-sink.d.ts`; <https://mediabunny.dev/guide/packets-and-samples>

### 4.3 decode-frames (→ pixels)
- `const sink = new VideoSampleSink(track, decoderOptions?)`; `await sink.getSample(timestamp)` or
  `for await (const sample of sink.samples(start?, end?))` (pre-decodes a few frames ahead),
  or `sink.samplesAtTimestamps(iterable)` for sparse access (decodes each packet at most once when monotonic).
- `VideoSample` → `toVideoFrame()`, `toCanvasImageSource()`, `draw()`, `drawWithFit({fit,rotation,crop})`,
  `transform({width,height,fit,rotate,crop,alpha})`, `copyTo(buffer)`, `allocationSize()`, `close()`.
  Convenient for the suite's FrameDigest (normalized RGBA sha256) oracle.
- For resized/rotation-corrected canvases use `CanvasSink(track, { width, height, fit, rotation, crop,
  poolSize, decoderOptions, alpha })` → `getCanvas()`, `canvases()`, `canvasesAtTimestamps()`. The `poolSize`
  ring-buffer keeps VRAM constant (best-path for repeated frame extraction).
- Audio decode: `AudioSampleSink(track)` → `getSample()`/`samples()`; or `AudioBufferSink(track)` →
  `buffers()`/`getBuffer()` yielding Web Audio `AudioBuffer`s (PCM digest oracle).
- `VideoSinkDecoderOptions`: `hardwareAcceleration` ('no-preference' default | 'prefer-hardware' |
  'prefer-software'), `optimizeForLatency`.
Cite: `dist/modules/src/media-sink.d.ts`; <https://mediabunny.dev/guide/packets-and-samples>

### 4.4 seek
- Keyframe seek: `EncodedPacketSink.getKeyPacket(timestamp, { verifyKeyPackets: true })` then iterate forward.
- Exact-frame seek: `VideoSampleSink.getSample(timestamp)` / `CanvasSink.getCanvas(timestamp)` — returns the
  last sample with start ≤ timestamp (frame-accurate). Audio: `AudioSampleSink.getSample(timestamp)`.
- Random sparse seeks: `samplesAtTimestamps()` / `canvasesAtTimestamps()` decode-once optimization.
Cite: `dist/modules/src/media-sink.d.ts`

### 4.5 encode (low-level)
- `VideoSampleSource`/`AudioSampleSource`/`CanvasSource`/`AudioBufferSource` feed an `Output` track; the
  encoder config is `VideoEncodingConfig` (`codec`, `bitrate` | `Quality`, `keyFrameInterval` (default 2 s),
  `sizeChangeBehavior`, `transform`, `latencyMode` ('quality' default | 'realtime'), `bitrateMode`
  ('variable' default | 'constant'), `hardwareAcceleration`, `scalabilityMode`, `contentHint`,
  `onEncodedPacket`/`onEncoderConfig`) and `AudioEncodingConfig` (`codec`, `bitrate?`, `transform`
  {numberOfChannels, sampleRate, sampleFormat}, `bitrateMode`).
- Capability probing: `canEncode/canEncodeVideo/canEncodeAudio`, `getEncodableVideoCodecs`,
  `getFirstEncodableVideoCodec(list, {width,height,bitrate})` — used for the per-browser codec gate (NA(browser)).
- `Quality` presets: `QUALITY_VERY_LOW`, `QUALITY_LOW`, `QUALITY_MEDIUM`, `QUALITY_HIGH`, `QUALITY_VERY_HIGH`.
Cite: `dist/modules/src/encode.d.ts`

### 4.6 remux (lossless container change) & 4.7 transcode (re-encode) & 4.8 trim — use the **Conversion API** (recommended fast path)
- `const conversion = await Conversion.init({ input, output, ... }); await conversion.execute();`
  `output` is a fresh `Output` with no pre-added tracks.
- **Remux vs transcode is automatic:** "copying media data whenever possible, otherwise transcoding it."
  → choosing a same-codec output container gives a lossless remux; changing codec/size/fps forces transcode.
  Force re-encode with `video.forceTranscode`/`audio.forceTranscode`.
- **Trim:** `trim: { start?, end? }` in seconds (negative offsets allowed).
- **Resize/rotate/crop/fps/alpha (A.8):** `video: { width, height, fit ('fill'|'contain'|'cover'),
  rotate (0|90|180|270), crop {left,top,width,height}, frameRate, codec, bitrate, alpha ('discard'|'keep'),
  keyFrameInterval, hardwareAcceleration, process(sample)=>... }`. `allowRotationMetadata` controls whether
  rotation is baked into pixels vs written as metadata.
- **Audio DSP (A.9):** `audio: { numberOfChannels, sampleRate, sampleFormat ('u8'|'s16'|'s32'|'f32'),
  codec, bitrate, process(sample)=>... }` → resample, channel-mix, bit-depth/format convert, gain via `process`.
- **Fan-out / ABR ladder (A.8):** pass an **array** (or a function returning an array) of per-track options →
  one output track per element (multiple renditions from one input).
- **Metadata copy/transform:** `tags` (object or `(inputTags)=>tags`); defaults to copying input tags.
- **Track selection:** `tracks: 'all' | 'primary'`; inspect `conversion.utilizedTracks`,
  `conversion.discardedTracks` ({track, reason, trackOptions}), `conversion.isValid`.
- **Progress / cancel:** set `conversion.onProgress = (p, processedTime) => ...` before `execute()`;
  `await conversion.cancel()` → throws `ConversionCanceledError`.
Cite: <https://mediabunny.dev/guide/converting-media-files>; `dist/modules/src/conversion.d.ts`

### 4.9 mux (from encoded tracks) / write
- `const output = new Output({ format: new Mp4OutputFormat({...}), target: new BufferTarget() })`.
- Sources: `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (pre-encoded passthrough — true mux),
  `VideoSampleSource`/`AudioSampleSource`, `CanvasSource`, `AudioBufferSource`,
  `MediaStreamVideoTrackSource`/`MediaStreamAudioTrackSource` (live), `TextSubtitleSource`.
- `output.addVideoTrack(src, {rotation, frameRate, ...})`, `addAudioTrack(...)`, `addSubtitleTrack(...)`,
  `output.setMetadataTags(tags)` (before start), `await output.start()` → `src.add(...)` → `await output.finalize()`;
  read `output.target.buffer` (BufferTarget). `output.getMimeType()` resolves after encoder init.
Cite: <https://mediabunny.dev/guide/writing-media-files>; `dist/modules/src/index.d.ts` (media-source exports)

### 4.10 decrypt (CENC / HLS-AES) — **supported** (key finding)
mediabunny is **not** a parser-only library here; it has real decryption:
- **ISOBMFF Common Encryption (CENC):** the ISOBMFF demuxer parses `sinf`/`schm`/`tenc`/`senc`/`saiz`/`saio`
  and supports scheme types **`cenc` (AES-CTR), `cens`, and `cbcs` (AES-CBC pattern, per-subsample IV)**;
  unsupported schemes warn (`Unsupported encryption scheme`). Provide keys via
  `IsobmffInputFormatOptions.resolveKeyId(({ keyId, psshBoxes }) => Uint8Array | hexString)` — a callback
  invoked per 32-char-hex key ID, with the `pssh` boxes (`PsshBox` type is public) so a DRM license can be fetched.
  Cite: `node_modules/mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js` (schm/tenc/senc handling, line ~935–978);
  `dist/mediabunny.d.ts` (`IsobmffInputFormatOptions.resolveKeyId`, `PsshBox`).
- **HLS AES-128:** the HLS segmented reader parses `#EXT-X-KEY` (`METHOD=AES-128`, `URI`, `IV`; Media-Sequence-as-IV
  fallback) and streams decryption through an internal `Aes128CbcContext` / `createAes128CbcDecryptStream`.
  Cite: `dist/modules/src/hls/hls-segmented-input.js`, `dist/modules/src/aes.js`.
- Negative/unencrypted: encryption info is `null` for clear tracks → unencrypted input is left untouched.

### 4.11 thumbnail / frame-at-time (A.7)
- `CanvasSink(track, { width, height, fit }).getCanvas(t)` → `WrappedCanvas { canvas, timestamp, duration }`.

## 5. Containers, codecs, features (capability surface)

### Containers — READ (`ALL_FORMATS`, individually tree-shakable: MP4, QTFF, WEBM, MATROSKA, MP3, WAVE, OGG, ADTS, FLAC, MPEG_TS, HLS)
- MP4 / ISOBMFF, MOV / QuickTime, **fragmented-mp4 / CMAF** (`.m4s`, with `initInput` for moov-less media),
  Matroska (MKV), WebM, MPEG-TS (`.ts`), **HLS (`.m3u8`, VOD + live)**, MP3, WAVE/RIFF, Ogg, ADTS/AAC, FLAC.
- **Not supported (→ NA(engine)):** AVI, FLV, AIFF, CAF, 3GP/3G2, GIF-as-video, SRT/WebVTT *read*.
Cite: <https://mediabunny.dev/guide/supported-formats-and-codecs>; `dist/modules/src/input-format.d.ts`

### Containers — WRITE
- MP4 (`Mp4OutputFormat`/`IsobmffOutputFormat`), MOV (`MovOutputFormat`), WebM (`WebMOutputFormat`),
  MKV (`MkvOutputFormat`), **CMAF (`CmafOutputFormat`)**, **HLS (`HlsOutputFormat`)**, Ogg, WAVE, MP3
  (`Mp3OutputFormat`), ADTS (`AdtsOutputFormat`), **MPEG-TS (`MpegTsOutputFormat`)**.
- **fastStart / fragmentation (A.3/A.10):** `IsobmffOutputFormatOptions.fastStart` =
  `false` | `'in-memory'` (moov-first, buffered) | `'reserve'` (reserve space, needs
  `maximumPacketCount` per track — the **in-place / no-second-pass** path) | `'fragmented'` (fMP4, streaming,
  `minimumFragmentDuration`). `metadataFormat` = 'auto'|'mdir'|'mdta'|'udta' for tag placement.
Cite: <https://mediabunny.dev/guide/writing-media-files>; `dist/mediabunny.d.ts` (`IsobmffOutputFormatOptions.fastStart`)

### Video codecs (`VIDEO_CODECS`)
`'avc'` (H.264), `'hevc'` (H.265), `'vp9'`, `'av1'`, `'vp8'`. **All routed through WebCodecs** → availability is
**browser-gated** (HEVC/AV1 often `NA(browser)`), not a mediabunny limit. 8-bit & 10-bit per browser support.
No native MPEG-2 / MPEG-4 part2 / Theora / ProRes encode/decode (→ NA(engine) unless the browser's WebCodecs lists them).
Cite: `dist/modules/src/codec.js`; <https://mediabunny.dev/guide/supported-formats-and-codecs>

### Audio codecs (`AUDIO_CODECS`)
- WebCodecs-gated compressed (`NON_PCM_AUDIO_CODECS`): `'aac'`, `'opus'`, `'mp3'`, `'vorbis'`, `'flac'`,
  `'ac3'`, `'eac3'`.
- **Always-supported pure-JS PCM** (`PCM_AUDIO_CODECS`, no WebCodecs needed): `'pcm-s16'`, **`'pcm-s16be'`**,
  `'pcm-s24'`, **`'pcm-s24be'`**, `'pcm-s32'`, `'pcm-s32be'`, `'pcm-f32'`, `'pcm-f32be'`, `'pcm-f64'`,
  `'pcm-f64be'`, `'pcm-u8'`, `'pcm-s8'`, `'ulaw'`, `'alaw'`. → covers the **big-endian & 24-bit PCM** edge (A.6/A.16)
  natively.
- **Encoder polyfills** (extension pkgs, §8) fill WebCodecs gaps: MP3, AAC, FLAC encode; AC-3/E-AC-3 decode+encode.
Cite: `dist/modules/src/codec.js`; <https://mediabunny.dev/guide/supported-formats-and-codecs>,
<https://mediabunny.dev/guide/extensions/mp3-encoder>

### Subtitle codecs (`SUBTITLE_CODECS`)
`'webvtt'` — **write-only** (cannot be read). mov_text / SRT read = NA(engine). Cite: `dist/modules/src/codec.js`

### Metadata / tags (A.11)
- Read: `input.getMetadataTags()` → `MetadataTags` (title/artist/album/date/genre/comment, images via
  `AttachedImage`/`RichImageData`, `AttachedFile`, raw tags). Write: `output.setMetadataTags(tags)` /
  Conversion `tags`. Rotation/display-matrix via `getRotation()`; multi-track + track selection supported;
  chapters/edit-lists/timecode are partial (edit lists: only first edit honored — warns on multi-edit).
Cite: `dist/modules/src/index.d.ts` (`MetadataTags`, `AttachedImage`, `RichImageData`); isobmff-demuxer edit-list warnings.

## 6. DOCUMENTED BEST-PERFORMANCE PATH (rule §0.9) — record as `configUsed`

- **Backend:** hardware-accelerated **WebCodecs** for all coded video/audio (no WASM, no CPU codec). The
  encoder/decoder `hardwareAcceleration` hint defaults to `'no-preference'`; docs say this is "best left on
  `'no-preference'`" (the browser picks hardware when available). For the suite's best-path we may set
  `'prefer-hardware'` to force the GPU engine and record it.
- **Pixel/scaling work:** resize/rotate/crop performed via `VideoSample.transform()` / `CanvasSink` /
  Conversion `width/height/fit/rotate/crop` — GPU-backed canvas/WebGL paths (alpha merge uses WebGL2 shaders,
  `ColorAlphaMerger`). No WebGPU backend is documented; effectively **WebGL2/canvas GPU > CPU**.
- **Pipelining:** the Conversion API runs reading + decoding + encoding + muxing **in lockstep**, using the
  Streams API internally with automatic backpressure and an internal decode/encode queue — you do **not** hand-tune
  `encodeQueueSize`/`decodeQueueSize`; mediabunny manages queue depth and avoids encoder starvation. Sinks
  "intelligently pre-decode a few frames ahead"; `EncodedPacketSink.packets()` "intelligently preloads based on
  consumer speed." This **is** the documented fastest configuration.
- **Lazy / streaming I/O:** `BlobSource`/`UrlSource` read only needed bytes (HTTP Range), so probe/seek touch
  minimal data; `StreamTarget`/`AppendOnlyStreamTarget` write progressively for arbitrarily large outputs.
  `BufferTarget` recommended only for < ~100 MB.
- **latencyMode:** `'quality'` (default) for throughput; `'realtime'` only for MediaStream/live (auto-selected).
- **No SharedArrayBuffer / no COOP+COEP required** for mediabunny itself (pure JS + WebCodecs; no mt-WASM core).
  COOP+COEP are still set by the suite globally (rule §8.5) for `measureUserAgentSpecificMemory()` and for the
  WASM frameworks — mediabunny simply doesn't need cross-origin isolation, which is itself a "what it takes"
  advantage to record.
Cite: <https://mediabunny.dev/guide/introduction>, <https://mediabunny.dev/guide/converting-media-files>,
<https://webcodecsfundamentals.org/projects/media-bunny/>; `dist/modules/src/media-sink.d.ts`, `conversion.d.ts`, `encode.d.ts`.

### Suggested `configUsed` for the report
`{ backend: 'webcodecs', pixelBackend: 'webgl2/canvas', hwAccel: 'prefer-hardware', wasmThreads: 0,
   pipeline: 'streaming-lockstep', queueDepth: 'auto', coreBuild: 'pure-ts-esm', sharedArrayBuffer: false,
   coopCoep: 'not-required' }`

## 7. Published benchmark numbers (Mediabunny-parity headline cases, §8.1)

Measured by the project on **Ryzen 7600X, RTX 4070, NVMe SSD, 2025-06-22**, reading
**BigBuckBunny1080pH264.mov (691 MiB) from disk** (the suite's `huge` bucket asset):

| Case | mediabunny | ffmpeg.wasm | mp4box.js |
| --- | --- | --- | --- |
| extract-metadata (ops/s ↑) | **862** | 1.83 | 43.5 |
| iterate-video-packets (packets/s ↑) | **10,800** | — | — |
| convert→WebM + resize 320×180 (frames/s ↑) | **804** | 12.0 | — |
| bundle-size (kB min+gzip ↓, all features) | **69.6** | 108 | 37.3 |

Tree-shaking: "as small as **5 kB gzipped**" when importing a minimal subset.
Cite: <https://mediabunny.dev/> (homepage benchmark + bundle table).
(These are the vendor's own numbers; the suite re-measures all four in real Brave, correctness-gated.)

## 8. Extension packages (optional, vendored locally, fill WebCodecs encode gaps)

- `@mediabunny/mp3-encoder` → `registerMp3Encoder()` (MP3 **encode**; LAME 3.100 SIMD WASM bundled single-file, ~130 kB gz).
- `@mediabunny/aac-encoder` → AAC **encode** (where WebCodecs lacks it).
- `@mediabunny/flac-encoder` → FLAC **encode**.
- `@mediabunny/ac3` → AC-3 / E-AC-3 **decode + encode**.
- `@mediabunny/server` → NodeAV-backed polyfill of all decoders/encoders for Node/Bun/Deno (not needed in-browser).
All peer-depend on `mediabunny`, register via core `registerEncoder`/`registerDecoder`, **bundle worker+WASM into one
file (no CDN, no wasmPath)** → §0.8-clean. Gate with `if (!(await canEncodeAudio('mp3'))) registerMp3Encoder()`.
Cite: <https://mediabunny.dev/guide/extensions/mp3-encoder>, <https://www.npmjs.com/package/@mediabunny/mp3-encoder>,
<https://github.com/Vanilagy/mediabunny/blob/main/packages/server/README.md>.
NOTE: not installed in this repo (`node_modules/@mediabunny` absent). Add via `bun add @mediabunny/mp3-encoder` etc. if
MP3/AAC/FLAC **encode** cases are needed; otherwise those encodes are `NA(browser)` where WebCodecs lacks them.

## 9. Developer / platform aspects (A.15)

- **TypeScript types:** first-class (`.d.ts` shipped; needs TS 5.7+ for consumers). Runtime needs ES2021+.
- **Zero runtime deps; no WASM in core; tree-shakable** (pay-for-what-you-use, `sideEffects:false`).
- **Runs in a Worker:** yes — pure JS + WebCodecs + OffscreenCanvas work in workers (`CanvasSink` yields
  `OffscreenCanvas` outside DOM). The suite runs every engine in a Worker (§7) — mediabunny is Worker-safe.
- **SharedArrayBuffer / COOP+COEP:** **not required** by mediabunny.
- **Hardware-accelerated:** yes (WebCodecs). **WebGPU:** not documented; uses WebGL2/canvas for pixel ops.
- **License:** MPL-2.0.
Cite: <https://mediabunny.dev/guide/introduction>, <https://mediabunny.dev/guide/installation>;
`node_modules/mediabunny/package.json` (`sideEffects:false`, browser field maps `node:fs/promises:false`).

## 10. HONEST LIMITS (→ NA(engine), rendered `-`)

1. **No software/CPU fallback codecs.** Coded video + most compressed audio require WebCodecs; if the browser
   can't configure a codec it is `NA(browser)` (not mediabunny's fault) — but there is no way to decode HEVC/AV1
   etc. where the browser lacks it. Distinguish NA(browser) from NA(engine) carefully.
2. **Containers it cannot read/write:** AVI, FLV, AIFF, CAF, 3GP/3G2, GIF-as-video → `NA(engine)`.
   (AIFF big-endian PCM *audio* is still covered via PCM codecs when in a supported container, but the AIFF
   *container* itself is unsupported.)
3. **Subtitles:** `webvtt` is **write-only**; no subtitle/text-track **reading** (mov_text/WebVTT/SRT read =
   NA(engine)); no SRT write.
4. **Encryption is decrypt-only for known schemes:** CENC `cenc`/`cens`/`cbcs` + HLS AES-128 decrypt are
   supported via `resolveKeyId`/EXT-X-KEY; **no ClearKey/EME-DRM license negotiation** is built in (you supply the
   key). `SAMPLE-AES` HLS (vs AES-128) is not handled. No *encryption* (writing encrypted output).
5. **No 2-pass / CRF encoding** (WebCodecs is 1-pass; `bitrate`/`Quality`/`bitrateMode` only). No HDR→SDR tone-map
   as a built-in (color-space is read, not remapped); HDR10 encode depends entirely on the browser.
6. **Edit lists:** only the first edit entry is honored (multi-edit warns); chapters/timecode partial.
7. **No WebGPU backend** documented.
8. **MP3/AAC/FLAC encode** need extension packages where WebCodecs lacks them (not in core).

## 11. Appendix A coverage (which rows mediabunny contests)

- **A.1 Input sources:** YES — `BlobSource`/`BufferSource`/`UrlSource`(HTTP Range)/`ReadableStreamSource`/
  `CustomSource`; always lazy/partial reads.
- **A.2 Containers READ:** YES for mp4/mov/CMAF/MKV/WebM/MPEG-TS/HLS/MP3/WAVE/Ogg/ADTS/FLAC. NA for AVI/FLV/AIFF/CAF/3GP/GIF.
- **A.3 Containers WRITE:** YES mp4(progressive/fastStart/in-place-reserve/fragmented)/mov/MKV/WebM/CMAF/HLS/WAV/MP3/ADTS/MPEG-TS/Ogg + streaming target.
- **A.4 Video DECODE:** YES avc/hevc/vp8/vp9/av1 (browser-gated); 8/10-bit per browser. NA mpeg2/mpeg4p2/theora/prores.
- **A.5 Video ENCODE:** YES avc/hevc/vp8/vp9/av1 (browser-gated); HDR10 per browser.
- **A.6 Audio DECODE & ENCODE:** YES aac/opus/mp3/vorbis/flac/ac3/eac3 (browser/extension-gated) + all PCM incl. **big-endian & 24-bit** (pure JS, always).
- **A.7 Core ops:** YES probe/demux/decode/seek/remux/transcode/trim/mux/extract-audio/replace-audio/decrypt/thumbnail/fragmentation. (concat/splice via two trims + mux; no single concat call.)
- **A.8 Video transforms:** YES resize/rotate(90/180/270 + display-matrix)/crop/fit-letterbox/fps-change/bitrate-or-Quality/**alpha-keep (VP8/VP9, WebGL2 merge)**/**fan-out ABR**. NA flip-only/2-pass/HDR→SDR tone-map.
- **A.9 Audio DSP:** YES resample/channel-mix/PCM-format-convert(incl. be/24-bit)/gain+fade via `process`.
- **A.10 Output/streaming:** YES buffer/streaming-target/CMAF/fastStart(moov-first)/tiny-TS/MSE-segments.
- **A.11 Metadata/tags:** YES read+write tags/duration/dims/fps/sr/ch/rotation/multi-track-select/cover-art. Partial chapters/edit-lists.
- **A.12 Encryption:** YES CENC `cenc`(ctr)/`cens`/`cbcs` decrypt + HLS AES-128 decrypt + leave-unencrypted-untouched. NA ClearKey/EME, SAMPLE-AES.
- **A.13 Subtitles/text/data:** PARTIAL — webvtt **write** only; no text-track read; no data/GPMF/KLV tracks → mostly NA(engine).
- **A.14 Performance dims:** YES — contests all (it's the reference): ops/s, packets/s, frames/s, decode/encode fps, seek ms, ttf, load/init (tiny), peak-mem, longtask, bundle-size (69.6 kB / 5 kB shakable), range-fetches.
- **A.15 Dev/platform:** TS types ✓, zero-dep ✓, tree-shakable ✓, Worker ✓, SAB/COOP+COEP **not required**, hw-accel(WebCodecs) ✓, WebGPU ✗ (WebGL2), MPL-2.0.
- **A.16 Edge cases:** YES open-GOP/B-frame, VFR, rotation-matrix, multi-track-select, headerless MediaRecorder WebM (computeDuration), big-endian/24-bit PCM, MP3 Xing-vs-CBR, FLAC ±SEEKTABLE seek, CENC cbcs per-subsample IV, fastStart:reserve large seek, fragmented/CMAF init+media split, multi-hour/many-samples, zero-length/truncated/fuzzed (lazy reader throws gracefully), seek-past-EOF, 0×0/1×1, extreme fps, audio/video-only, mislabeled codec, TS wraparound, gapless audio, variable channels. Metamorphic invariants all expressible via Input/Output/Conversion round-trips.

## 12. Primary documentation URLs (cited above)

- Home + benchmarks: <https://mediabunny.dev/>
- Introduction / technical overview: <https://mediabunny.dev/guide/introduction>
- Installation / self-host: <https://mediabunny.dev/guide/installation>
- Reading media files: <https://mediabunny.dev/guide/reading-media-files>
- Packets & samples: <https://mediabunny.dev/guide/packets-and-samples>
- Writing media files: <https://mediabunny.dev/guide/writing-media-files>
- Converting media files: <https://mediabunny.dev/guide/converting-media-files>
- Supported formats & codecs: <https://mediabunny.dev/guide/supported-formats-and-codecs>
- Extensions (mp3-encoder reference): <https://mediabunny.dev/guide/extensions/mp3-encoder>
- API reference: <https://mediabunny.dev/api/>
- Releases / changelog: <https://github.com/Vanilagy/mediabunny/releases>
- Repo + README: <https://github.com/Vanilagy/mediabunny>
- Local ground truth: `node_modules/mediabunny/dist/mediabunny.d.ts`, `dist/modules/src/{conversion,encode,media-sink,input,codec,input-format}.d.ts`, `dist/modules/src/{isobmff/isobmff-demuxer,hls/hls-segmented-input,aes}.js`
