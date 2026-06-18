# Dossier — `platform` (raw browser media primitives)

> **What this is.** `platform` is **not an npm package**. It is the suite's **baseline / contender** built
> only from raw browser primitives: **WebCodecs** (`VideoDecoder`/`VideoEncoder`, `AudioDecoder`/`AudioEncoder`,
> `ImageDecoder`), `<video>` + **MSE** (`MediaSource`/`ManagedMediaSource`/`SourceBuffer`), **MediaRecorder**,
> and **MediaCapabilities** for hardware probing. There is no version, no install, no vendor step — only the
> browser. Per spec §1 it never *defines* scope; it runs as the floor that real frameworks must beat.
>
> Research date: **2026-06-17**. WebCodecs spec is a **W3C Working Draft, 8 June 2026**
> (<https://www.w3.org/TR/webcodecs/>). MDN WebCodecs/Codec-selection pages last modified May 15 2026; the
> `VideoDecoder.isConfigSupported` page Feb 9 2026. Everything below is read from current docs, not memory.

---

## 0. TL;DR for the adapter author

- **Demux/remux/mux are NOT browser primitives.** WebCodecs takes/produces *encoded chunks*, never container
  bytes. There is **no built-in MP4/MKV/WebM parser or muxer** in the platform. To probe/demux you must
  hand-roll a container reader (the existing adapter does inline MP4 + WebM), and to mux you must hand-roll a
  writer. The browser only gives you: decode chunks→frames, encode frames→chunks, play a container in
  `<video>`/MSE, and (re-)encode a live stream via MediaRecorder. So the honest capability picture is:
  **probe ✓(hand-rolled) · demux ✓(hand-rolled, limited) · decodeFrames ✓ · seek ✓(`<video>`) · transcode
  ✓(lossy, MediaRecorder) · remux ✗ · trim ✗ · mux ✗ · decrypt ✗**.
- **Fastest documented path** = hardware WebCodecs in a **Worker**, frames moved **transferable / zero-copy**,
  encoder/decoder kept fed but bounded by watching `encodeQueueSize`/`decodeQueueSize` (the Chrome guide gates
  on `> 2`), frames `close()`d immediately, and **`OffscreenCanvas` via `transferControlToOffscreen()`** (with
  WebGPU/WebGL when available) for any resize/color/pixel work. Load/init (codec configure + warmup) is
  untimed per §0.7. (<https://developer.chrome.com/docs/web-platform/best-practices/webcodecs>)
- **Codec gating is real and per-device.** HEVC/AV1 (and even high H.264 profiles) are hardware-gated and
  OS/GPU dependent. The ONLY honest check is `VideoEncoder/VideoDecoder.isConfigSupported(fullCodecString)`
  with `hardwareAcceleration` preference, plus `MediaCapabilities.decodingInfo()` for the `<video>`/MSE path.
  Unsupported here → **`NA(browser)`** (distinct from `NA(engine)`).
- **Vendoring (§0.8): nothing to vendor.** No CDN, no WASM, no JS bundle — the primitives ship in the browser.
  The only "hosting" requirement is the suite's own server emitting **COOP/COEP** headers so the page is
  cross-origin isolated (enables `SharedArrayBuffer` + `measureUserAgentSpecificMemory()`); WebCodecs itself
  does NOT need cross-origin isolation, but the suite-wide headers are uniform anyway (§8.5).

---

## 1. Latest version / availability

There is no library version. "Version" = the browser build + its codec stack, captured at runtime by the
adapter's `deriveId()` (e.g. `platform@chrome-126`, `platform@safari-26`). The relevant spec snapshot is:

- **WebCodecs** — W3C Working Draft **8 June 2026**. <https://www.w3.org/TR/webcodecs/>
- **Media Source Extensions** — recommendation; `ManagedMediaSource` is the newer Apple addition.
- **MediaStream Recording (MediaRecorder)** — W3C spec; format set is **implementation-defined**.
- **Media Capabilities** — for `decodingInfo()`/`encodingInfo()`.

**Browser availability of WebCodecs** (from current support summaries; verify at runtime, never assume):

| Browser | WebCodecs | Notes |
| --- | --- | --- |
| Chrome / Edge | 94+ | full (video+audio+image); desktop strongest |
| Firefox | 130+ desktop | desktop only — **Android still has `VideoDecoder` undefined** |
| Safari | **26.0+** full | **16.4–18.7 were video-only**: `AudioDecoder`/`AudioEncoder`/`EncodedAudioChunk`/`ImageDecoder` were `undefined` — **guard each interface separately** |
| Opera 80+, Samsung Internet 17+ | yes | |

Sources: <https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API> ·
<https://www.testmuai.com/learning-hub/webcodecs-browser-support/>

**Secure context + Worker:** WebCodecs constructors are only exposed in a **secure context** (HTTPS/localhost)
and the whole API is **available in Dedicated Web Workers**
(<https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>).

---

## 2. Recommended API per operation

The platform has no "library API"; each op is assembled from primitives. This is the mapping the adapter uses.

### probe / extract-metadata
- **No native container probe.** Options, fastest-first:
  1. **Hand-rolled box/EBML parse** (inline MP4 `moov` walk; WebM/MKV EBML walk) — exact codec/dims/fps/track
     list/duration without decoding. This is what the adapter does (`probe.ts`, `demux-mp4.ts`,
     `demux-webm.ts`). It is the only way to get *packet/codec* truth from raw platform.
  2. **`<video>` metadata** (`loadedmetadata` → `duration`, `videoWidth/Height`) — page-only, gives duration +
     dims but **no codec id and no fps**, and duration may be estimate-only for some containers.
  3. **`MediaCapabilities.decodingInfo({type:'file', video/audio:{contentType,…}})`** to *probe* whether a
     codec is decodable + `smooth` + `powerEfficient` (hardware) — not a probe of an asset, a probe of a
     config. <https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo>

### demux / iterate-packets
- **No native demuxer.** Hand-rolled MP4 (progressive `moov`/`mdat` sample table) + WebM/MKV (SimpleBlock /
  BlockGroup) extraction → `PacketInfo[]` (size, pts/dts, keyframe). TS/HLS/OGG/FLAC/etc. are **`NA(engine)`**
  for raw platform unless you write a parser for each. The adapter honestly NA's everything but MP4/MOV + WebM/MKV.

### decode-frames (→ pixels)
- **`VideoDecoder`** (`configure(VideoDecoderConfig)` → `decode(EncodedVideoChunk)` → `output(VideoFrame)`).
  `VideoDecoderConfig` fields: `codec` (full string), `description` (extradata — see §5), `codedWidth/Height`,
  `displayAspectWidth/Height`, `colorSpace`, `hardwareAcceleration`, `optimizeForLatency`, plus newer
  `rotation` (0/90/180/270) and `flip`. <https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/configure>
- **`AudioDecoder`** → `AudioData` (Float32 samples via `copyTo`, interleaved or planar).
  <https://developer.mozilla.org/en-US/docs/Web/API/AudioData>
- The chunks must come from your own demuxer (the platform won't produce them).

### seek
- **`HTMLVideoElement.currentTime = t`** then `requestVideoFrameCallback`/`seeked` → `drawImage` grab.
  **Page-only** (needs DOM `<video>`). Keyframe-exactness depends on the container/codec; frame-accurate seek
  requires demux + `VideoDecoder` from the prior keyframe (no native API).
- For streaming seek, **MSE** `SourceBuffer.appendBuffer` of the segment covering `t`, then set `currentTime`.

### encode (used by transcode)
- **`VideoEncoder`** (`configure(VideoEncoderConfig)` → `encode(VideoFrame, {keyFrame})` → `output(chunk, meta)`).
  Config fields incl. `codec`, `width/height`, `displayWidth/Height`, `bitrate`, `framerate`,
  `hardwareAcceleration` (`no-preference`|`prefer-hardware`|`prefer-software`), `alpha` (`discard`|`keep`),
  `bitrateMode` (`constant`|`variable`|`quantizer`), `latencyMode` (`quality`|`realtime`), `scalabilityMode`
  (e.g. L1T2), `contentHint`, and `avc:{format:'avc'|'annexb'}` / `hevc:{format:'annexb'|'hevc'}`.
  <https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/configure>
- **`AudioEncoder`** (Opus/AAC/…); Opus has rich opts (`application`,`complexity`,`format:'opus'|'ogg'`,
  `frameDuration`,`useinbandfec`,`usedtx`,…). <https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder/configure>
- The encoder emits the **codec description** (avcC/hvcC/vpcC) in the **first chunk's metadata**
  (`EncodedVideoChunkMetadata.decoderConfig.description`) — you need a muxer to write it.

### remux (lossless container change)
- **`NA(engine)`.** WebCodecs only deals in encoded *chunks*; there is **no container muxer** to rewrap them.
  You can decode-then-re-encode (lossy) via MediaRecorder, but that is transcode, not remux.

### transcode (re-encode)
- **Best/correct path (lossy, real-time-bound, video-only):** decode (`<video>` or `VideoDecoder`) →
  `OffscreenCanvas` (resize/color) → `canvas.captureStream()` → **`MediaRecorder`** → WebM (Chromium/Firefox)
  or MP4 (Safari, OS encoder). This is the adapter's `transcode.ts`. It is **real-time-bound** (recorder runs
  at playback speed) and **cannot exceed real-time** — a hard ceiling vs WASM/orchestrator frameworks.
- A fully-controlled alternative is `VideoDecoder`→pixel-op→`VideoEncoder`→**your own muxer**, but without a
  muxer you can only emit raw chunks, so the *file-out* transcode is MediaRecorder-bound.

### trim / cut
- **`NA(engine)`.** No frame-accurate cut + rewrap without a muxer. (Could record a sub-range via MediaRecorder
  but that is lossy transcode, not trim, and not frame-accurate.)

### mux (from encoded tracks)
- **`NA(engine)`.** MediaRecorder re-encodes a *live MediaStream*; it cannot ingest opaque `EncodedTrack`
  chunks. There is no platform muxer.

### decrypt (CENC/HLS)
- **`NA(engine)` for byte/frame export.** EME (`MediaKeys`/`requestMediaKeySystemAccess`) drives **protected
  playback to the screen**; it never hands back decrypted bytes/frames. **WebCodecs has no DRM bridge** —
  `EncodedVideoChunk` is plain bytes; encrypted streams still require MSE+EME and stay on the protected path
  (<https://www.testmuai.com/learning-hub/webcodecs-browser-support/>). So decrypt-to-bytes is impossible here.

---

## 3. Documented BEST-PERFORMANCE path (§0.9)

From the Chrome WebCodecs best-practices guide
(<https://developer.chrome.com/docs/web-platform/best-practices/webcodecs>) and MDN:

1. **Run in a Dedicated Worker.** "By design WebCodecs does all the heavy lifting asynchronously and off the
   main thread"; callbacks fire many times/sec, so keep frame/chunk handling off the main thread to stay
   responsive. WebCodecs is exposed in Workers
   (<https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>).
2. **Flow control via queue size.** Watch `encoder.encodeQueueSize` (and `decoder.decodeQueueSize`); the guide
   gates on `> 2` (drop/await rather than pile up) to avoid overwhelming the encoder. There is no single
   prescribed depth — keep it small but non-starving; the `dequeue` event fires when the queue drains so you
   can resume feeding (<https://www.w3.org/TR/webcodecs/>).
3. **Zero-copy / transferable frames.** `VideoFrame` and `AudioData` are **transferable**; move them between
   workers without copying (`postMessage(frame, [frame])`). VideoFrames are large (≈30 MB at 4K) and live in
   VRAM (<https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>).
4. **`close()` promptly.** Every `VideoFrame`/`AudioData` holds a media resource (GPU/VRAM); close immediately
   after encode/render or you risk OOM/crash. Pattern from the guide:
   `if (encoder.encodeQueueSize > 2) frame.close(); else encoder.encode(frame, {keyFrame});`
5. **Offload pixel work.** `HTMLCanvasElement.transferControlToOffscreen()` → render entirely off main thread;
   prefer **WebGPU > WebGL > OffscreenCanvas 2D** for resize/rotate/color/SSIM (§0.9). (The guide names
   OffscreenCanvas explicitly; WebGPU/WebGL is the suite's own §0.9 ordering.)
6. **Hardware acceleration.** Set `hardwareAcceleration:'prefer-hardware'` and **probe with
   `isConfigSupported`** before configuring; if unsupported, fall back to `'prefer-software'` or NA. Use
   `MediaCapabilities.decodingInfo().powerEfficient` as the hardware signal for the `<video>`/MSE path
   (<https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo>).
7. **Pipeline/stream** capture→worker→encode→decode→render continuously, not batch.

**`configUsed` to record (bestPath):**
`{ backend:'webcodecs', hwAccel:true (prefer-hardware, probed), wasmThreads:0 (no WASM), pipeline:'streaming',
queueDepth:2 (Chrome guide gate), worker:true, pixelBackend:'webgpu>webgl>offscreen2d', frameTransfer:'transferable',
decode:'VideoDecoder', encode:'VideoEncoder+MediaRecorder(out)' }`

---

## 4. Headers / flags / Worker setup

- **Secure context** mandatory for WebCodecs/ImageDecoder constructors (HTTPS or localhost). The suite serves
  on localhost so this holds.
- **COOP/COEP for the suite (§8.5):** `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp` → cross-origin isolation → `SharedArrayBuffer` +
  `measureUserAgentSpecificMemory()`. **WebCodecs/MediaRecorder/MSE themselves do NOT require cross-origin
  isolation** — but the headers are applied uniformly so every engine (incl. mt-WASM rivals) gets its best
  path, and platform gets precise peak-memory. `crossOriginIsolated` reports the runtime status.
  Sources: <https://web.dev/articles/coop-coep> · <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy>
- **No browser flags required** on Chrome/Safari 26/Firefox-desktop for the baseline path. HEVC hardware on
  some Chromium/Linux builds historically needed flags/extensions, but the suite treats absence as
  `NA(browser)` rather than flipping flags (real-browser, what-users-get, §0.4).
- **Worker setup:** spawn a module Worker; construct `VideoDecoder`/`VideoEncoder` inside it; transfer
  `VideoFrame`s in/out. `<video>`/MSE attach + `seek` + MediaRecorder-out need the **main thread (DOM)**;
  the adapter throws a clear NA-style error for those off-thread (already implemented). MSE-in-Worker exists
  (`MediaSource.handle`, Chrome 108+) but is **Chromium-only** — Firefox/Safari lack it
  (<https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API>).

---

## 5. Codec strings, gating, and the `description` (muxing) detail

### Fully-specified codec strings are REQUIRED
`isConfigSupported`/`configure` need precise strings, never `"h264"`/`"vp9"`. Canonical examples from MDN Codec
selection (<https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection>):

| Codec | Example string(s) | Approx support (MDN) |
| --- | --- | --- |
| H.264 / AVC | `avc1.42001f` (baseline 720p), `avc1.4d0034` (main 4K), `avc1.64003e` (high 8K) | 85–99% |
| VP9 | `vp09.00.40.08.00` (L4 2K), `vp09.00.50.08.00` (L5 4K) | ~99.9% |
| AV1 | `av01.0.05M.08` (L3.1 720p), `av01.0.08M.08` (L4 1080p) | ~88% |
| HEVC / H.265 | `hvc1.1.6.L120.B0` (L4 1080p), `hvc1.1.6.L150.B0` (L5 4K) | ~73% |
| AAC | `mp4a.40.2` (MP4) | ~90% encode |
| Opus | `opus` (WebM) | ~96% encode |
| MP3 / FLAC / Vorbis | `mp3` / `flac` / `vorbis` | **~0% / ~0% / ~4% ENCODE** (decode varies) |
| PCM | `pcm-f32`,`pcm-s16`,`pcm-s24`,`pcm-s32`,`pcm-u8` | |

### Hardware gating — the per-browser reality (cite-heavy because it's the crux)
- **HEVC ≈ universal on Safari/Apple, nearly absent on Edge/Firefox; Chrome works on non-Windows + on Windows
  with OS support.** Edge on Windows shows *less* HEVC than Chrome on the same engine (Microsoft licensing).
  Firefox ≥133 enabled HEVC **decode** by default on **Windows only**.
- **AV1 ≈ universal on Chrome/Edge/Firefox; Safari is the holdout** — AV1 decode only on **M3+/A17 Pro+ class
  hardware** (M3 Macs, M4 iPad Pro, iPhone 15 Pro / 16 family); older Apple devices get **no AV1** (no software
  decoder shipped). AV1 **hardware encode** is rare (newer Intel Arc / Snapdragon); software AV1 encode is
  3–5× heavier than VP9.
- **AV1 + HEVC together cover ~99.7% of decode sessions** (AV1 for Chromium/FF, HEVC for Safari).
- **Hardware availability is OS+GPU+chip specific** — `isConfigSupported` is "the only honest check"; Linux
  often lacks HEVC HW without proprietary drivers.

Sources: <https://www.testmuai.com/learning-hub/webcodecs-browser-support/> ·
<https://webcodecsfundamentals.org/datasets/codec-analysis-2026/> ·
<https://github.com/StaZhu/enable-chromium-hevc-hardware-decoding>

**Suite mapping:** any codec where `isConfigSupported({hardwareAcceleration:'prefer-hardware', codec:…})`
(then `'no-preference'`) returns `supported:false` on the live browser ⇒ **`NA(browser)`** (`-ᵇ`), NOT
`NA(engine)`. A codec the platform path simply can't carry (e.g. encode MP3/FLAC) ⇒ `NA(engine)` (`-`).

### `isConfigSupported` behavior (important nuances)
- Returns `{supported:boolean, config}` where `config` is a **normalized copy** with unrecognized fields
  **stripped**. Use the returned `config` to configure.
  <https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static>
- Throws **`TypeError`** for *invalid* configs (empty codec, negative `codedWidth`, etc.) — that is distinct
  from `supported:false` (valid but unsupported). The adapter must `try/catch` and treat TypeError as a
  programming/format error, not NA.
- `supported:true` does **not** guarantee the encoder can hit the requested bitrate on this device at runtime —
  still `try/catch` around `configure()`/`encode()` and listen for the error callback.
- Pass `hardwareAcceleration` to disambiguate HW vs SW; iterate candidate strings (highest→lowest) picking the
  first supported (MDN Codec-selection loop).

### The `description` field = the muxing seam (avc1 vs avc3 / hvc1 vs hev1)
This governs whether parameter sets are out-of-band (in a `description`) or in-band (Annex B). From the
WebCodecs **AVC registration** (<https://www.w3.org/TR/webcodecs-avc-codec-registration/>):
- **Encoder** `avc:{format:'avc'}` (default): "SPS and PPS data are **not** included in the bitstream and are
  instead emitted via the output callback" (i.e. in `decoderConfig.description` = avcC). `format:'annexb'`:
  "SPS and PPS data are included periodically throughout the bitstream."
- **Decoder**: "If the `description` is present, it is assumed to be an AVCDecoderConfigurationRecord … and the
  bitstream is assumed to be in **avc** format. If the `description` is not present, the bitstream is assumed to
  be **annexb** format." → `avc1.*`/`hvc1.*` need a `description` (avcC/hvcC); `avc3.*`/`hev1.*` carry params
  in-band. HEVC mirrors this via `hevc:{format:'annexb'|'hevc'}`. **The adapter's demuxer must extract avcC/
  hvcC and pass it as `description` for `avc1`/`hvc1` tracks**, else decode fails — already handled in
  `demux-mp4.ts` (`config.description`).
- The encoder surfaces the description on the **first output chunk** via
  `EncodedVideoChunkMetadata.decoderConfig` (<https://www.w3.org/TR/webcodecs/>).

---

## 6. MSE / `<video>` playback + ImageDecoder + MediaRecorder specifics

### MSE (the streaming/seek/playback-oracle path)
- `MediaSource` + `SourceBuffer.appendBuffer()` feed fragmented MP4 / WebM segments to a `<video>`;
  `MediaSource.isTypeSupported(mime)` gates container+codec. Baseline interop = **fMP4 + H.264 + AAC**.
- **`ManagedMediaSource`** (Apple) actively evicts buffered data under memory/power pressure
  (`ManagedSourceBuffer`, `bufferedchange`); it is how **MSE finally reached iPhone in Safari 17.1** (was 17.0
  on iPad/Mac). **Gotcha:** MMS only activates when an **AirPlay source alternative** is present *or* you call
  `disableRemotePlayback()` on the element (WWDC23). Feature-detect `ManagedMediaSource` and fall back to
  `MediaSource`. Because MMS can evict any range any time, re-check buffered ranges before seeking.
  Sources: <https://webkit.org/blog/14735/webkit-features-in-safari-17-1/> ·
  <https://www.radiantmediaplayer.com/blog/at-last-safari-17.1-now-brings-the-new-managed-media-source-api-to-iphone.html>
- **MSE-in-Worker** (`MediaSource.handle` → transfer → `HTMLMediaElement.srcObject`) is **Chrome 108+ only**
  (<https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API>).

### ImageDecoder (negative-input guard + image decode)
- `new ImageDecoder({type, data, premultiplyAlpha, colorSpaceConversion, desiredWidth/Height, preferAnimation,
  transfer})`; static `ImageDecoder.isTypeSupported(mime)`; `decode({frameIndex, completeFramesOnly})` →
  `{image: VideoFrame, complete}`; `tracks` (`ImageTrackList`) with `ImageTrack.frameCount`/`repetitionCount`/
  `animated`. Decodes still+animated GIF/PNG/JPEG/WebP/AVIF → `VideoFrame`; usable in Workers; secure context.
  Supported MIME set is **not standardized** — probe with `isTypeSupported`. **Caveat: `undefined` on Safari
  16.4–18.7.** Sources: <https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder> ·
  <https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder/ImageDecoder>
- Relevant to **A.16 image-negatives**: feeding a JPEG/PNG into a *video/audio* op must fail cleanly — the
  adapter's inline demuxers reject non-MP4/WebM bytes (NA/throw), satisfying the guard.

### MediaRecorder (the only file-out write path)
- `record a MediaStream → Blob`; **formats are implementation-defined** — always `MediaRecorder.isTypeSupported(mime)`.
  Chromium defaults: `video/webm` (VP8/VP9) + `audio/webm` (Opus); MP4 only when an OS encoder exists (probe).
  **Safari writes only `video/mp4`/`audio/mp4` (H.264/AAC), never WebM.** Firefox returns false for
  `video/webm;codecs=h264`. Bitrate tweaks can break cross-browser playability.
  Sources: <https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static> ·
  <https://media-codings.com/articles/recording-cross-browser-compatible-media>
- Hard limits: **real-time-bound** (cannot beat playback speed), **lossy** (re-encode), **video+live-audio
  only from a stream** — it is transcode, never remux/trim/mux of opaque chunks.

---

## 7. How to VENDOR it locally (§0.8)

**Nothing to vendor.** No npm package, no CDN, no WASM core, no JS bundle — every primitive (WebCodecs, MSE,
MediaRecorder, ImageDecoder, MediaCapabilities) is part of the browser. `init()` is therefore trivial
(no module import, no WASM compile); the only "setup" is constructing+`configure()`+warming a codec inside the
Worker, which is untimed (§0.7). The single hosting requirement is the **suite server emitting COOP/COEP**
(already a suite-wide concern, §8.5) so the page is cross-origin isolated for `SharedArrayBuffer` /
`measureUserAgentSpecificMemory()` — not a platform-specific vendoring step. `installCmd` = **n/a**.

---

## 8. Honest limits (→ these become `NA(engine)` `-`)

- **No demuxer/remuxer/muxer.** remux, trim, mux → **`NA(engine)`**. Demux/probe only work for the containers
  you hand-roll (this adapter: progressive MP4/MOV + WebM/MKV video track); TS/HLS/OGG/FLAC/AIFF/CAF/AVI/FLV →
  `NA(engine)` unless a parser is written.
- **No DRM/decrypt-to-bytes.** EME is playback-to-screen; WebCodecs has no DRM bridge → decrypt **`NA(engine)`**.
- **Transcode is lossy + real-time-bound + video-only** (MediaRecorder); cannot exceed real-time, no
  frame-accurate trim, no audio-only file transcode via this path → trim `NA(engine)`, lossless transcode N/A.
- **Audio encode codecs are sparse:** MP3/FLAC encode ≈ 0% support; Vorbis ≈ 4%. The adapter currently
  declares **no audio codecs** (no audio op wired) — keep honest until an audio path is built.
- **Codec hardware gating** (HEVC/AV1/high-profile H.264) is per-device → **`NA(browser)` `-ᵇ`** when
  `isConfigSupported` is false; never silently downgrade to software-claimed-as-hardware.
- **DOM-bound ops** (`<video>` probe/seek, MediaRecorder-out) cannot run in a Worker — off-thread → NA there.
- **Firefox Android**: `VideoDecoder` undefined; **Safari 16.4–18.7**: audio/image WebCodecs undefined — both
  surface as `NA(browser)` per interface.
- **MediaRecorder format set is browser-specific & non-interoperable** (WebM≠Safari, MP4≠FF-WebM-H264).

---

## 9. Appendix A coverage (which rows `platform` contests)

Support is **research + `capabilities()` + runtime feature-detect**; below is what raw platform can *legitimately*
contest, matching the adapter's honest declaration (`probe/demux/decodeFrames/seek/transcode`; features
`resize`,`alpha`; containersIn mp4/mov/webm/mkv; out webm; video h264/hevc/vp8/vp9/av1 — each codec gated at
runtime). It never *defines* scope (§1) but runs as baseline on in-scope rows.

- **A.1 Input/reading:** ✓ File/Blob/ArrayBuffer; ✓ URL+**HTTP Range** + streaming via `fetch`/`ReadableStream`
  (and `ImageDecoder` accepts a ReadableStream); MSE `appendBuffer` is incremental.
- **A.2 Containers READ:** ✓ mp4/mov + webm/mkv (hand-rolled demux/probe). `-` for ts/hls/ogg/flac/aiff/caf/
  3gp/avi/flv/gif-as-video (no parser).
- **A.3 Containers WRITE:** **webm** (Chromium/FF) / **mp4** (Safari) via **MediaRecorder only** — lossy,
  re-encoded, not lossless mux; no fragmented/faststart/streaming-target control. Mostly `-` vs real muxers.
- **A.4 Video DECODE:** ✓ H.264/VP8/VP9 broadly; **HEVC/AV1 → `-ᵇ` when HW-gated off** (per §5). 8/10-bit via
  codec string + colorSpace. Strong contender on decode fps.
- **A.5 Video ENCODE:** ✓ via `VideoEncoder` (H.264/VP8/VP9, HEVC/AV1 where HW present); but **file-out** is
  MediaRecorder-bound → contests encode fps mainly through the recorder path. 10-bit/HDR config-gated.
- **A.6 Audio DECODE/ENCODE:** AudioDecoder/AudioEncoder exist (AAC/Opus/…), but **no audio op is wired** and
  MP3/FLAC encode ≈ unsupported → currently `-` (honest); revisit if an audio path is added.
- **A.7 Core ops:** probe ✓ · demux ✓ · decode-frames ✓ · seek ✓(`<video>`) · remux `-` · transcode
  ✓(lossy) · trim `-` · concat `-` · mux `-` · extract/replace-audio `-` · decrypt `-` · thumbnail/frame-at-time
  ✓(seek+grab) · fragmentation/MSE-segments: read/playback ✓, generation `-`.
- **A.8 Video transforms:** **resize** ✓ (OffscreenCanvas/WebGPU in transcode path); **alpha** ✓ (VP8/VP9
  `alpha:'keep'`). rotate/flip/crop/pad/fps-change/color-convert/HDR-tonemap/fan-out → `-` (not implemented;
  rotate readable via decoder `rotation` but not written).
- **A.9 Audio DSP:** `-` (no audio op; resample possible via Web Audio but out of this adapter's scope).
- **A.10 Output/streaming:** buffer ✓ (MediaRecorder Blob); MSE-ready playback ✓ as oracle; fragmented/
  faststart/tiny-chunk/streaming-target generation `-`.
- **A.11 Metadata read:** duration/dims ✓ (`<video>`+demux), fps/codec ✓ (demux), rotation readable; **write
  tags `-`**; chapters/edit-lists/cover-art/timecode `-`.
- **A.12 Encryption/DRM:** decrypt-to-bytes `-` (EME is playback-only); leave-unencrypted-untouched is moot.
- **A.13 Subtitles/text/data:** `-` (no track extraction primitive).
- **A.14 Performance:** contests **extract-metadata ops/s**, **iterate-packets packets/s**, **decode fps**,
  **seek ms**, **time-to-first-frame**, **load/init ms** (≈0 — no load!), **peak mem**, **longtask ms**,
  **bundle size** (0 kB — ships in browser). convert-to-WebB+resize frames/s via MediaRecorder (real-time
  capped). source-reads/range-fetches via the suite's counting Source.
- **A.15 Dev/platform:** built-in (no deps, 0 bundle); runs in Worker (WebCodecs/ImageDecoder; not `<video>`/
  MSE-out/recorder); **does NOT itself need SAB/COOP+COEP** (suite sets them anyway);
  **hardware-accelerated** WebCodecs ✓; WebGPU/WebGL available for pixel work; license = N/A (platform).
- **A.16 Edge cases:** decode open-GOP/B-frame reorder ✓ (decoder reorders); VFR readable; rotated readable;
  multi-track select via demux; headerless MediaRecorder WebM ✓ (it *produces* them — duration may be absent,
  a known edge); image-negatives fail cleanly ✓; fuzz/truncated → demuxers throw (graceful) ✓; many of the
  muxer-dependent edges (fastStart-reserve, CMAF split, gapless padding write) → `-`.

---

## 10. Documentation URLs (cited above)

- WebCodecs API (interfaces, Worker note, secure context): <https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>
- WebCodecs spec (WD 8 Jun 2026; metadata.decoderConfig, dequeue, scalabilityMode): <https://www.w3.org/TR/webcodecs/>
- Codec selection (full codec strings, isConfigSupported loops): <https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection>
- VideoEncoder.configure (config fields, hwAccel/bitrateMode/latencyMode/alpha): <https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/configure>
- VideoDecoder.configure (description/extradata, rotation/flip, optimizeForLatency): <https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/configure>
- VideoEncoder.isConfigSupported (returns normalized config, strips unknown fields): <https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static>
- VideoDecoder.isConfigSupported (TypeError on invalid): <https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/isConfigSupported_static>
- AudioEncoder.configure (Opus opts, bitrateMode): <https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder/configure>
- AudioData (planar/interleaved, transferable, close): <https://developer.mozilla.org/en-US/docs/Web/API/AudioData>
- AVC codec registration (avc.format avc/annexb; description present⇒avc, absent⇒annexb): <https://www.w3.org/TR/webcodecs-avc-codec-registration/>
- Chrome WebCodecs best practices (Worker, queueSize>2, transferable, close, OffscreenCanvas, pipeline): <https://developer.chrome.com/docs/web-platform/best-practices/webcodecs>
- MediaCapabilities.decodingInfo (supported/smooth/powerEfficient, Worker, EME main-thread): <https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo>
- ImageDecoder + constructor (isTypeSupported, decode, tracks, Safari 16.4–18.7 caveat): <https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder> · <https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder/ImageDecoder>
- MSE API (ManagedMediaSource, MediaSourceHandle/Worker Chrome 108+, isTypeSupported): <https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API>
- ManagedMediaSource on iOS 17.1 (AirPlay/disableRemotePlayback gotcha): <https://webkit.org/blog/14735/webkit-features-in-safari-17-1/> · <https://www.radiantmediaplayer.com/blog/at-last-safari-17.1-now-brings-the-new-managed-media-source-api-to-iphone.html>
- MediaRecorder.isTypeSupported + cross-browser format reality: <https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static> · <https://media-codings.com/articles/recording-cross-browser-compatible-media>
- COOP/COEP cross-origin isolation (SharedArrayBuffer/measureUserAgentSpecificMemory): <https://web.dev/articles/coop-coep> · <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy>
- Per-browser HEVC/AV1 hardware gating data: <https://www.testmuai.com/learning-hub/webcodecs-browser-support/> · <https://webcodecsfundamentals.org/datasets/codec-analysis-2026/> · <https://github.com/StaZhu/enable-chromium-hevc-hardware-decoding>
