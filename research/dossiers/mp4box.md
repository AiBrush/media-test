# Dossier — mp4box.js (npm `mp4box`)

> Research-first dossier per test-instructions.md §15. Pure-JS ISOBMFF (MP4/MOV/fragmented-MP4)
> parser, **sample-demuxer**, **on-the-fly fragmenter/segmenter**, and **box writer/muxer**. It does
> **NOT** decode or encode media (no pixels, no PCM, no re-encode) and handles **only ISOBMFF**
> (no MKV/WebM/TS/MP3/WAV/OGG). It is the canonical "feed-WebCodecs" demuxer in W3C's own samples.
>
> Researched 2026-06-17 against the current official docs/repo/npm/release notes (see Doc URLs).

---

## 0. Identity & version

| Field | Value |
| --- | --- |
| npm package | `mp4box` |
| **Latest version** | **2.3.0** (published 2025-11-22) |
| Installed in this repo | **0.5.4** (legacy GPAC lineage; pinned by `package.json` `"mp4box": "^0.5.2"`) |
| License | BSD-3-Clause |
| Repo | https://github.com/gpac/mp4box.js |
| Docs site | https://gpac.github.io/mp4box.js/ |
| Author/maintainers | Cyril Concolato (GPAC); cconcolato, denizatgpac (npm) |
| Runtime | Browser + Node.js (≥ 20.8.1 for the 2.x build toolchain) |

### ⚠️ Version split — read this first
There are **two distinct lineages** published under the same npm name `mp4box`:

1. **Legacy 0.5.x** (what is currently `node_modules/mp4box@0.5.4` here): the original GPAC JS,
   hand-written ES5, **Grunt**-built into `dist/mp4box.all.js` / `mp4box.simple.js` (+ `.min.js`),
   depends on a bundled `DataStream.js`, **no TypeScript types**, `DataStream` default endianness is
   **little-endian** (you must pass `DataStream.BIG_ENDIAN` explicitly). README/API in
   `node_modules/mp4box/README.md`.
2. **Modern 1.x → 2.x** (TypeScript rewrite, announced 2025-06-19 as **MP4Box.js 1.0.0**): full
   refactor to **TypeScript + ESM** with **CJS compat** and **shipped `.d.ts` types**; built with
   **tsup** (ESM/CJS/IIFE); ships `dist/mp4box.all.js` + `dist/mp4box.all.d.ts` (and a `simple`
   flavor). Two **breaking changes** vs legacy: (a) **`DataStream` default endianness is now
   big-endian**; (b) **`discardMdatData` defaults to `true`** (media bytes are dropped during
   parsing unless you call `createFile(true)` — critical for any rewrite/mux path).
   - Source: https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/
   - Releases: v2.3.0 (2025-11-22), v2.2.0 (2025-11-09), v2.1.2 (2025-10-09), v2.1.1 (2025-08-30),
     v2.1.0/2.0.0 (2025-08-15), v1.5.0 (2025-08-13), v1.4.x (Jul–Aug 2025). v2.0.0 removed
     `MP4BoxStream` and set big-endian DataStream default. (https://github.com/gpac/mp4box.js/releases)

**Recommendation for this suite:** the adapter should target the **2.x API** (latest, typed, current
docs), and vendoring should pin **`mp4box@2.3.0`** locally. If we keep `0.5.4`, the API surface used
is nearly identical for the read/demux/segment paths *except* (i) `DataStream` endianness must be set
explicitly to `BIG_ENDIAN` in the avcC-extraction path, (ii) there is no `.d.ts`, and (iii)
`discardMdatData` behaves differently. Either way, **bump `package.json` to a current major** before
benchmarking so the number reads "mp4box at its current best."

---

## 1. What it is / what it is for

mp4box.js is the JavaScript port of GPAC's `MP4Box` tool. It works on **boxes (atoms)** of the
**ISO Base Media File Format** and is fed `ArrayBuffer`s by the application. Documented uses
(README "It can be used to:"):
- **Get information about an MP4 file** (duration, tracks, codecs…) — i.e. **probe**.
- **Segment** an MP4 file for **Media Source Extensions (MSE)** — i.e. fragment/segment generation.
- **Extract** samples from an MP4 (encoded packets) — i.e. **demux** (feeds WebCodecs/text tracks).
- Plus **on-the-fly fragmentation**, **box writing**, and a **file-diff** tool (README + demos).

Sources: README (`node_modules/mp4box/README.md`),
https://github.com/gpac/mp4box.js/blob/main/README.md

### Hard scope limits (these become `NA(engine)` in the report)
- **Container scope = ISOBMFF only** (mp4 / mov / fragmented-mp4 / CMAF / 3gp-family, all box-based).
  It **does not** parse Matroska/WebM (EBML), MPEG-TS, HLS, MP3-elementary, WAV/RIFF, AIFF, FLAC,
  OGG, ADTS, CAF. (https://github.com/gpac/mp4box.js — "handles ISO Base Media File Format only".)
- **No decode** — it never produces pixels or PCM. It hands you the *encoded* sample bytes +
  `avcC/hvcC/vpcC/av1C` description; you feed those to **WebCodecs `VideoDecoder`** yourself.
- **No encode / no transcode** — it cannot re-encode a codec. It only *muxes* already-encoded chunks
  (e.g. from a WebCodecs `VideoEncoder`) into a new ISOBMFF file.
- **No decryption** — it parses CENC signalling boxes (`pssh`, `tenc`, `saiz/saio`, `senc`) but does
  **not** perform AES-CTR/CBCS/HLS-AES decryption itself.

---

## 2. Recommended API per operation

mp4box.js is **callback/event driven**. The core object is an `ISOFile` created via
`MP4Box.createFile()`. You push bytes with `appendBuffer(ab)` (each `ab` carries a `fileStart`
byte-offset), receive `onMoovStart` → `onReady(info)` once the `moov` is parsed, then `start()`
sample processing for **extraction** (demux) and/or **segmentation** (fragment), and `flush()` when
input ends. (README §"Getting Information", §"Segmentation", §"Extraction".)

| Suite Op | mp4box API (best path) | Notes |
| --- | --- | --- |
| **probe** | `createFile()` → set `onReady` → `appendBuffer(ab{fileStart})` → read `info` (or `getInfo()` in Node) | `onReady` fires when `moov` is parsed; only the `moov` region needs to be downloaded. Supports **partial/range** reads via `appendBuffer` return value (offset of next needed bytes). |
| **demux** | `setExtractionOptions(track_id, user, {nbSamples, rapAlignement})` → `start()` → `onSamples(id,user,samples[])` | Each sample = `{track_id, description, is_rap/is_sync, timescale, dts, cts, duration, size, data}`. Feed straight into `EncodedVideoChunk`/`EncodedAudioChunk`. **This is the WebCodecs demux fast path.** |
| **decode** | **NA(engine)** | Pair with WebCodecs `VideoDecoder`/`AudioDecoder` using the extracted `description`. mp4box produces no pixels. |
| **encode** | **NA(engine)** | No encoder. |
| **remux** | partial — **ISOBMFF→fragmented-ISOBMFF only** via `setSegmentOptions` + `initializeSegmentation` + `onSegment`; or full rewrite via `getBuffer()`/`save()` | Cannot change container family (mp4↔mkv/webm/ts impossible). "remux" = progressive-MP4 → fMP4/CMAF. |
| **transcode** | **NA(engine)** | No re-encode. |
| **trim** | indirect — `seek(time, useRap)` to a RAP, then re-mux selected samples via `addSample` | No first-class trim API; build it from seek + sample selection + writer. Keyframe-bounded; frame-accurate cut needs decode+re-encode (out of scope). |
| **mux** | `createFile()` → `addTrack({codec, width, height, timescale, avcDecoderConfigRecord/description, ...})` → `addSample(trackId, data, {duration, is_sync})` per chunk → `getBuffer()`/`save()` | Muxes already-encoded WebCodecs chunks into a complete MP4 (metadata **and** mdat in one step since 1.0.0). |
| **decrypt** | **NA(engine)** | Parses CENC boxes only; no AES. |
| **seek** | `seek(time /*sec*/, useRap)` → returns **byte offset** of next bytes to `appendBuffer` | Used to drive lazy range fetching; lands on the previous RAP when `useRap=true`. Exact-frame seek requires WebCodecs decode afterward. |

### 2.1 Probe — concrete pattern (README §Getting Information)
```javascript
const mp4boxfile = MP4Box.createFile();
mp4boxfile.onError = (e) => { /* String error */ };
mp4boxfile.onReady = (info) => {
  // info.duration / info.timescale (durationSec = duration/timescale)
  // info.isFragmented, info.isProgressive, info.brands, info.tracks[]
  //   track: { id, codec ("avc1.42c00d"/"mp4a.40.2"), nb_samples, timescale,
  //            duration, bitrate, language, track_width/height,
  //            video:{width,height} | audio:{sample_rate,channel_count,sample_size} }
};
ab.fileStart = 0;                 // REQUIRED on every buffer
mp4boxfile.appendBuffer(ab);      // returns expected fileStart of next buffer
mp4boxfile.flush();
```
Notes for the normalizer (engine.ts `NormalizedMetadata`): `durationSec = info.duration/info.timescale`;
fps must be derived (e.g. `nb_samples / (track.duration/track.timescale)` for CFR, or per-sample
`duration` deltas for VFR — mp4box exposes per-sample `duration` so VFR is detectable). Rotation comes
from the track header **matrix** (`tkhd.matrix`) — read it from boxes, not from width/height swap.

### 2.2 Demux → WebCodecs (the documented fast path, W3C sample) — VERBATIM
This is the canonical mp4box→WebCodecs demuxer from W3C's WebCodecs samples
(`w3c/webcodecs/samples/video-decode-display/demuxer_mp4.js`). It is the reference for our
`demux`/`decodeFrames`/`seek` adapters:

```javascript
// Get the appropriate `description` for a specific track. Assumes H.264, H.265, VP8, VP9, or AV1.
#description(track) {
  const trak = this.#file.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8);  // Remove the box header.
    }
  }
  throw new Error("avcC, hvcC, vpcC, or av1C box not found");
}

#onReady(info) {
  const track = info.videoTracks[0];
  this.#onConfig({
    codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec,  // browsers only accept 'vp8'
    codedHeight: track.video.height,
    codedWidth: track.video.width,
    description: this.#description(track),
  });
  this.#file.setExtractionOptions(track.id);
  this.#file.start();
}

#onSamples(track_id, ref, samples) {
  for (const sample of samples) {
    this.#onChunk(new EncodedVideoChunk({
      type: sample.is_sync ? "key" : "delta",
      timestamp: 1e6 * sample.cts / sample.timescale,
      duration:  1e6 * sample.duration / sample.timescale,
      data: sample.data
    }));
  }
}
```
Key facts encoded above (cite W3C sample + README):
- **Codec description** = the `avcC`/`hvcC`/`vpcC`/`av1C` box serialized minus its 8-byte header.
  `DataStream` must be **big-endian** (explicit in legacy 0.5.x; default in 2.x).
- **Keyframe flag**: 2.x/W3C uses `sample.is_sync`; legacy README documents `is_rap`. Adapter should
  read `sample.is_sync ?? sample.is_rap`.
- **Timestamps** convert to microseconds: `1e6 * cts/timescale` (PTS) and `dts` analogously — exactly
  the units our `PacketInfo.ptsUs/dtsUs` want.
- **Streaming feed**: pipe `fetch().body` → `WritableStream` whose `write(chunk)` copies the
  Uint8Array into an `ArrayBuffer`, stamps `buffer.fileStart`, and calls `appendBuffer`; `close()`
  calls `flush()`. (W3C `MP4FileSink`.) This is the recommended streaming/pipelining shape.
- W3C sample loads mp4box **inside a Worker** via `importScripts(".../mp4box.all.min.js")`.

Source: https://w3c.github.io/webcodecs/samples/video-decode-display/ (file `demuxer_mp4.js`).

### 2.3 Segmentation (MSE / fMP4 output) (README §Segmentation)
```javascript
mp4boxfile.onReady = (info) => {
  mp4boxfile.onSegment = (id, user, buffer, sampleNumber, last) => { /* fMP4 fragment ArrayBuffer */ };
  mp4boxfile.setSegmentOptions(info.tracks[0].id, sourceBuffer, { nbSamples: 1000, rapAlignement: true });
  const initSegs = mp4boxfile.initializeSegmentation();  // [{id, user, buffer(initSeg), sampleNumber, last}]
  mp4boxfile.start();
};
```
- `nbSamples` (default 1000) = samples per `onSegment` callback; `rapAlignement` (default true) = each
  segment starts on a RAP. `initializeSegmentation([mode])` returns init segments; 2.x adds a `mode`
  ('combined' | 'per-track') and `normalizeAudioSampleEntriesForMSE` segment option.
- `unsetSegmentOptions(track_id)`, `stop()`, `releaseUsedSamples(id, sampleNumber)` manage lifecycle/memory.

### 2.4 Mux / write (WebCodecs encode → MP4) (gpac.io 1.0.0 post + community refs)
```javascript
const out = MP4Box.createFile();
let trackId = null;
const enc = new VideoEncoder({
  output: (chunk, metadata) => {
    if (trackId === null) {                       // first chunk carries the description
      trackId = out.addTrack({
        width, height, timescale: 1_000_000,
        avcDecoderConfigRecord: metadata.decoderConfig.description,  // or hevc/vpc/av1 equivalent
      });
    }
    const u8 = new Uint8Array(chunk.byteLength); chunk.copyTo(u8);
    out.addSample(trackId, u8, { duration: 1_000_000/fps, is_sync: chunk.type === 'key' });
  },
  error: (e) => console.error(e),
});
// ... configure encoder, encode VideoFrames ...
await enc.flush();          // CRITICAL — flush BEFORE save or you get a truncated file
out.save("output.mp4");     // or: const ab = out.getBuffer();  (complete file: moov + mdat)
```
- Since **1.0.0** mp4box writes a **complete** MP4 (metadata **and** `mdat`) in one step; earlier
  versions were prone to "9-byte"/few-frame truncated output. The #1 cause of broken output is
  forgetting `await encoder.flush()` before `save()`/`getBuffer()`.
- **Rewrite gotcha**: to *rewrite an existing file* (keep its parsed `mdat`), create with
  `MP4Box.createFile(true)` because **`discardMdatData` defaults to `true`** since 1.0.0.
- Source: https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/

### 2.5 Metadata read/write (boxes) (gpac.io post + README contribute)
- Read tags/structure by navigating boxes: `mp4boxfile.getBoxes("udta")`, then `udta.ilst` for
  iTunes-style tags; rotation/matrix from `tkhd`; edit lists from `edts/elst`; brands from `ftyp`.
- Write tags by constructing/serializing boxes (`box.write(stream)`) and rewriting via `getBuffer()`.
  This is **possible but low-level** (no high-level `setTag` helper); count it as a partial
  `metadata:write` capability gated by careful box surgery.

---

## 3. Documented BEST-PERFORMANCE path (§0.9)

mp4box.js is **pure JS, single-threaded, CPU-only**. It has **no WASM, no SIMD, no WebGPU/WebGL, no
multi-threaded core** and does not itself touch hardware codecs. Its "fast path" is therefore about
**lazy/streaming IO + Worker offload + feeding hardware WebCodecs**, not internal acceleration.

| §0.9 lever | mp4box reality / best-path config |
| --- | --- |
| Hardware WebCodecs | **Indirect & essential** — mp4box demuxes; the *decode/encode* runs on WebCodecs `VideoDecoder`/`VideoEncoder` with `hardwareAcceleration:'prefer-hardware'`. mp4box's job is to deliver `EncodedVideoChunk` + `description` correctly (§2.2). |
| WebGPU > WebGL > 2D | **NA** — no pixel work; mp4box never scales/rotates pixels. |
| Multi-threaded WASM / SharedArrayBuffer | **NA** — pure JS, no WASM, no SAB requirement. |
| Worker offload | **Yes — recommended.** Run mp4box parsing/demux in a **Worker** (W3C sample does, via `importScripts`); parsing a large `moov` and per-sample bookkeeping otherwise block the main thread. |
| Streaming / pipelining | **Yes — recommended.** Stream the file in (`fetch().body.pipeTo(WritableStream)`), `appendBuffer` chunk-by-chunk with `fileStart`, and start extraction before the whole file arrives. `appendBuffer` **returns the next needed byte offset**, enabling **HTTP-Range** partial reads (probe needs only up to/around `moov`). |
| Queue depth | mp4box has no internal queue. The W3C streaming sink uses `WritableStream(..., {highWaterMark: 2})` ("large enough for smooth streaming, lower is better for memory"). For the **WebCodecs** stage, tune `VideoDecoder`/`VideoEncoder` `decodeQueueSize`/`encodeQueueSize` to avoid starvation. |
| Zero-copy / transferable | Sample `data` are `Uint8Array` views you can hand to `EncodedVideoChunk` directly; transfer `ArrayBuffer`s across the Worker boundary. **Memory hygiene:** call `releaseUsedSamples(id, n)` to free processed sample data, and `createFile(true)` only when you actually need `mdat` retained. |
| Native fast path | For metadata-only/probe, only parse up to `moov`: append the head, and if `moov` is at the tail, follow `appendBuffer`'s returned offset to range-fetch just the `moov` region — avoid downloading the whole file. |

**`configUsed` to record (suggested):**
`{ backend:'pure-js', hwAccel:false, wasmThreads:0, pipeline:'streaming(appendBuffer+fileStart)', worker:true, queueDepth:'highWaterMark=2', rangeReads:true, discardMdatData:true }`
For ops that pair with WebCodecs (decode/encode/trim), the WebCodecs side records its own
`{ hwAccel:true, decodeQueueSize/encodeQueueSize: N }`.

---

## 4. Required headers / flags / Worker setup

- **No COOP/COEP / SharedArrayBuffer requirement.** Pure JS — runs without cross-origin isolation.
  (The suite-wide COOP:same-origin + COEP:require-corp headers from §8.5 are harmless to mp4box; it
  simply does not need them. It does **not** enable `measureUserAgentSpecificMemory` by itself — that
  gating is browser/headers-driven, independent of mp4box.)
- **No browser flags** needed for mp4box itself. (Any flags belong to the paired WebCodecs codecs,
  e.g. HEVC/AV1 availability.)
- **Worker**: recommended, not required. Load via ESM `import` in a module Worker (2.x) or
  `importScripts('.../mp4box.all.min.js')` in a classic Worker (W3C sample uses the latter with the
  legacy IIFE/UMD bundle).
- **MSE caveat** (segmentation→playback path): the official demo notes Chrome's MSE "does not support
  adding new SourceBuffers once the existing SourceBuffers are initialized, but you can remove some,
  even during playback." Plan track/SourceBuffer setup up-front. (https://gpac.github.io/mp4box.js/test/)

---

## 5. How to VENDOR it LOCALLY (§0.8 — no CDN at run time)

mp4box installs via bun and is served from the local origin; **never** `cdn.jsdelivr.net`/unpkg at run
time (the README's `<script src="https://cdn.jsdelivr.net/...">` is for convenience only — do not use
it here).

**Install:**
```
bun add mp4box@2.3.0
```
(Repo currently pins `^0.5.2` → resolves to 0.5.4; bump to a current major for the benchmark.)

**Files to serve (pick by build target):**
- **ESM (2.x, recommended for our Vite/bundler path):** import from the package; the bundler resolves
  `node_modules/mp4box` (`main`/`module` → `dist/mp4box.all.js`, types `dist/mp4box.all.d.ts`).
  In the adapter: `import * as MP4Box from 'mp4box';` then `MP4Box.createFile()`. `DataStream` is a
  named export in 2.x (needed for the avcC-description path).
- **Classic Worker / IIFE-global (matches the W3C sample):** copy `node_modules/mp4box/dist/mp4box.all.min.js`
  into the engine's local `vendor/` dir and `importScripts('/.../vendor/mp4box.all.min.js')`; the
  global is `MP4Box` and `DataStream`.
  - Legacy 0.5.4 bundles to vendor: `dist/mp4box.all.js` / `dist/mp4box.all.min.js` (with map),
    and `dist/mp4box.simple(.min).js`. (Verified in `node_modules/mp4box/dist/`.)
- **`simple` flavor**: parse-only (no writing, no sample processing) and only some boxes — smaller,
  but it **cannot demux/segment/mux**. Use the **`all`** flavor for this suite (we need extraction +
  segmentation + writing).

Per the engine layout (§3) vendor under `src/engines/mp4box/vendor/`. Pin the version + bundle hash in
the run `env`. The `.gitignore` already ignores `src/engines/**/vendor/`, so vendored bundles are
local-only and rebuilt from the pinned `bun install`.

---

## 6. Honest limits (→ these render as `-` / `NA(engine)`)

- **No decode (pixels):** `decodeFrames`, `seek` (exact frame), `thumbnail` → `NA(engine)` standalone
  (only via WebCodecs pairing). For the suite's `decodeFrames` contract (returns `FrameSink`), mp4box
  alone = `NA(engine)`.
- **No encode / transcode / resize / rotate-pixels / fps-change / color / HDR tone-map / alpha
  compositing:** all `NA(engine)` (Appendix A.5, A.8 video transforms).
- **No audio DSP** (resample/channel-mix/PCM convert/gain/fade) and **no audio decode/encode** →
  A.9, A.6 encode = `NA(engine)`. (It *demuxes* audio packets + reads `mp4a/esds` description.)
- **Non-ISOBMFF containers** (MKV/WebM/TS/HLS/MP3/WAV/AIFF/FLAC/OGG/ADTS/CAF) → `NA(engine)` for
  probe & demux. **In scope only:** mp4, mov, fragmented-mp4/CMAF, 3gp-family.
- **No decryption** (CENC ctr/cbcs, HLS-AES, ClearKey) → `NA(engine)` (parses signalling boxes only).
- **Container conversion limited to ISOBMFF→fragmented-ISOBMFF.** Cross-family remux impossible.
- **Trim is keyframe-bounded** and DIY (seek + sample selection + writer); frame-accurate trim needs
  decode+re-encode → out of scope.
- **Single-threaded, CPU-only**: no WASM/SIMD/WebGPU/WebGL/multi-thread; throughput is JS-bound.
- **Metadata write is low-level box surgery** (no high-level tag API) — partial `metadata:write`.
- **`discardMdatData` default true (1.x+)**: forgetting `createFile(true)` silently drops media on
  rewrite; a frequent footgun.
- **API is callback-based** (`onReady`/`onSamples`/`onSegment`), not Promise-native — adapter must
  wrap it in Promises and handle `onError` (error is a String).

---

## 7. Appendix A coverage (which rows mp4box can contest)

Legend: ✅ supported · ⚠️ partial/indirect · `-` NA(engine).

| Row | Verdict | One-line note |
| --- | --- | --- |
| **A.1 Input sources & reading modes** | ✅ | File/Blob/ArrayBuffer; **HTTP-Range/lazy** via `appendBuffer` returning next offset; **streaming** via `fetch().body`→`WritableStream`→`appendBuffer(fileStart)`; reads without loading whole file. |
| **A.2 Containers — READ (demux/probe)** | ⚠️ ISOBMFF only | mp4/mov/fragmented-mp4/CMAF/3gp **only**. MKV/WebM/TS/HLS/MP3/WAV/AIFF/FLAC/OGG/ADTS/CAF = `-`. Probe **ops/s** + demux **packets/s** contender on ISOBMFF. |
| **A.3 Containers — WRITE (mux)** | ⚠️ | MP4 progressive (`addTrack`/`addSample`/`save`), **fragmented-mp4/CMAF** (`setSegmentOptions`/`onSegment`), **streaming write** (per-segment callbacks). mov/mkv/webm/wav/mp3/ogg/adts/ts = `-`. fastStart(moov-first)/in-place-reserve not documented as first-class = treat as `-`/unverified. |
| **A.4 Video codecs — DECODE** | `-` | No pixels (mp4box *identifies* codecs & extracts `avcC/hvcC/vpcC/av1C` description; contests **packet-iteration A.7**, not decode). |
| **A.5 Video codecs — ENCODE** | `-` | No encoder. |
| **A.6 Audio codecs — DECODE & ENCODE** | `-` | No audio decode/encode (demuxes audio packets + reads `esds`/`dOps` only). |
| **A.7 Core operations** | ⚠️ | **probe** ✅, **demux/iterate-packets** ✅, **remux (→fMP4)** ⚠️, **seek (RAP→byte-offset)** ✅, **mux (from encoded tracks)** ✅, **fragmentation/MSE-segments** ✅; decode/transcode/decrypt/thumbnail/extract-audio-to-wav = `-`; trim ⚠️ (keyframe, DIY). |
| **A.8 Video transforms** | `-` | No resize/rotate-pixels/crop/fps/color/HDR/alpha/fan-out (no pixel pipeline). |
| **A.9 Audio transforms / DSP** | `-` | None. |
| **A.10 Output / streaming modes** | ⚠️ | buffer (`getBuffer`/`save`), **streaming target** (`onSegment` per fragment), **fragmented/CMAF**, MSE-ready segments ✅; fastStart/tiny-188B-TS = `-`. |
| **A.11 Metadata / tags / structure** | ⚠️ | **read** duration/dims/fps(derived)/sample-rate/channels/language/brands/**rotation(matrix)**/edit-lists/multi-track ✅; **chapters/cover-art/timecode** read via boxes ⚠️; **write tags** = ⚠️ low-level box surgery only. |
| **A.12 Encryption / DRM** | `-` | Parses CENC boxes (`pssh/tenc/senc/saiz/saio`) but does **not** decrypt. |
| **A.13 Subtitles / text / data tracks** | ⚠️ | Extracts text-track samples (e.g. `mov_text`/`tx3g`) and data/metadata-track samples (KLV/GPMF live in mp4 tracks) via `setExtractionOptions`; muxing text tracks via `addTrack` ⚠️. WebVTT/SRT-in-non-mp4 = `-`. |
| **A.14 Performance dimensions** | ⚠️ | Contests **extract-metadata ops/s**, **iterate-video-packets packets/s**, **load/init ms** (tiny pure-JS bundle, fast init), **bundle size kB**, **source-reads/range-fetches** (lazy). decode/encode fps, seek-to-frame ms (needs WebCodecs) = `-` standalone. |
| **A.15 Developer / platform aspects** | info | TS types (2.x) ✅; **1 runtime dep** in `all` flavor (DataStream — bundled, so effectively zero external at runtime) / **zero deps** in `simple`; tree-shakeable ⚠️ (monolithic bundle, but `simple` flavor trims); runs in Worker ✅; needs SAB/COOP+COEP ❌ (no); hardware-accel ❌ (pure JS); WebGPU/WebGL ❌; license BSD-3-Clause. |
| **A.16 Deep edge cases** | ⚠️ | **Strong:** B-frame reorder (exposes `dts`/`cts` separately), VFR (per-sample `duration`), rotation (matrix), multi-track select, fragmented/CMAF init+media split, many-samples/multi-hour (lazy + `releaseUsedSamples`), zero-length/truncated/fuzzed (must reject via `onError` gracefully). **`-`/NA:** headerless-MediaRecorder-WebM (not ISOBMFF), big-endian/24-bit PCM (WAV/AIFF), MP3 Xing-TOC, FLAC SEEKTABLE, CENC cbcs decrypt, HLS-AES (all non-ISOBMFF or decode/decrypt). Metamorphic invariants involving decode/transcode = `-`; `probe(remux(x)).dur ≈ probe(x).dur` (fMP4 round-trip) = testable ✅. |

---

## 8. Suggested `capabilities()` (honest declaration)

```
operations:   { probe:true, demux:true, remux:true, seek:true, mux:true,
                transcode:false, decodeFrames:false, trim:true /* keyframe-bounded */, decrypt:false }
containersIn: ['mp4','mov']            // ISOBMFF family (incl. fragmented-mp4/CMAF, 3gp)
containersOut:['mp4']                  // progressive + fragmented MP4 (fMP4/CMAF)
videoCodecs:  ['h264','hevc','vp8','vp9','av1']   // IDENTIFY/demux/description only (no decode/encode)
audioCodecs:  ['aac','opus','mp3','flac']         // demux/description only (no decode/encode)
encryption:   []                       // parses CENC signalling, does not decrypt
features:     ['fragmented','metadata:read', /* partial */ 'metadata:write', 'webcodecs:demux-feed']
```
> Note vs engine.ts canonical tokens: codec lists declare *demux/identify* support, NOT decode/encode.
> Because mp4box does not route through the browser codec gate for **parsing**, it can opt into
> `features:['webcodecs:independent']` for its probe/demux/segment ops (pure-JS, no browser codec
> needed); its decode/encode-dependent paths are simply absent (NA). The runner must not gate
> probe/demux on browser codec availability.

---

## 9. Documentation URLs (cited)

- npm package: https://www.npmjs.com/package/mp4box
- Repo: https://github.com/gpac/mp4box.js
- README (main): https://github.com/gpac/mp4box.js/blob/main/README.md
- Docs/demos site: https://gpac.github.io/mp4box.js/ and https://gpac.github.io/mp4box.js/test/
- Releases (version history): https://github.com/gpac/mp4box.js/releases
- 1.0.0 TypeScript announcement (breaking changes, mdat/discardMdatData, big-endian DataStream):
  https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/
- WebCodecs demux fast-path (avcC/hvcC/vpcC/av1C description, streaming sink, Worker):
  https://w3c.github.io/webcodecs/samples/video-decode-display/
  (raw: https://raw.githubusercontent.com/w3c/webcodecs/main/samples/video-decode-display/demuxer_mp4.js)
- Local README (installed 0.5.4): node_modules/mp4box/README.md
- GPAC project: https://gpac.io
