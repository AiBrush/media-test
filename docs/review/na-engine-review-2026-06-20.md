# NA_ENGINE Review - Chromium run 2026-06-20T18:52:40.747Z

Source run:
`results/runs/stored-test-data-chromium-2026-06-20T18-52-40-747Z.json`

## Restated Scope

The requested audit was to review the 3,740 cases believed to be `NA_ENGINE`, verify whether each case is truly unsupported by the relevant engine/framework rather than simply skipped because the adapter or harness has not implemented it, use web research for current framework support, and report the cases that should be re-implemented.

The concrete file does not contain 3,740 `NA_ENGINE` rows. It contains 4,408 total result rows:

| Status | Rows |
| --- | ---: |
| PASS | 668 |
| NA_ENGINE | 2,655 |
| NA_ASSET | 1,019 |
| NA_BROWSER | 66 |

The number 3,740 equals all N/A-like rows combined: `NA_ENGINE + NA_ASSET + NA_BROWSER`. This report therefore focuses on the 2,655 actual `NA_ENGINE` rows and calls out the other N/A rows so they are not misattributed to engine support.

## Method

1. Parsed every result row and grouped all `NA_ENGINE` cells by engine, family, and reason.
2. Read the local capability contract and negotiation logic:
   - `src/core/engine.ts`
   - `src/core/scenario.ts`
   - `src/core/runner.ts`
3. Read the adapter capability declarations and comments for all eight engines:
   - `src/engines/aibrush-media/adapter.ts`
   - `src/engines/ffmpeg-wasm/adapter.ts`
   - `src/engines/mediabunny/adapter.ts`
   - `src/engines/mp4box/adapter.ts`
   - `src/engines/platform/adapter.ts`
   - `src/engines/remotion-media-parser/adapter.ts`
   - `src/engines/remotion-webcodecs/adapter.ts`
   - `src/engines/web-demuxer/adapter.ts`
4. Cross-checked local claims against primary/current docs:
   - Mediabunny supported formats/codecs, conversion, output formats, and HLS docs.
   - FFmpeg.wasm overview/performance docs plus upstream FFmpeg filters/formats docs.
   - MP4Box.js official repo/docs and GPAC TypeScript rewrite post.
   - Remotion WebCodecs and Media Parser docs plus installed `4.0.479` type declarations.
   - Web-Demuxer official repo/docs.
   - W3C WebCodecs spec for browser-codec boundary.

Important caveat: this is a support audit, not a rerun after changing adapters. Rows marked "reimplementation" still need an implementation and a fresh browser run before promotion from N/A to PASS/FAIL.

## NA_ENGINE Census

By engine:

| Engine | NA_ENGINE rows | Initial verdict |
| --- | ---: | --- |
| `aibrush-media@dev` | 551 | Placeholder adapter; implementation absent. |
| `mp4box@2.3.0` | 450 | Mostly honest parser-only/ISOBMFF limits, but mux and WebCodecs-backed decode/seek are potential gaps. |
| `remotion-media-parser@4.0.479` | 420 | Mostly honest read-only limits, but MOV/MKV normalization and WebCodecs-backed decode/seek are potential gaps. |
| `web-demuxer@4.0.0` | 394 | Mostly honest no-write limits, but read-container capability appears under-declared. |
| `platform@chrome-149` | 368 | Mostly honest raw-browser limits, with possible video-only canvas transform gaps. |
| `remotion-webcodecs@4.0.479` | 279 | Mostly honest output-format/no-mux/no-trim limits for installed version, with a few potential adapter gaps. |
| `ffmpeg.wasm@0.12.15` | 123 | Several strong false-N/A candidates. |
| `mediabunny@1.48.0` | 70 | Several strong false-N/A candidates in the reference adapter. |

By family:

| Family | NA_ENGINE rows |
| --- | ---: |
| transcode | 479 |
| mux | 320 |
| remux | 289 |
| trim | 262 |
| audio-dsp | 241 |
| robustness | 239 |
| streaming-output | 157 |
| decode-seek | 139 |
| probe | 123 |
| demux | 115 |
| metadata | 111 |
| encryption | 99 |
| performance | 81 |

## Reimplementation Required

These groups should not be accepted permanently as `NA_ENGINE` without implementation work, because the framework docs or local code show likely support.

### 1. `mediabunny@1.48.0` reference adapter

High confidence reimplementation items:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 10 | Missing audio DSP features: `resample`, `downmix`, `upmix`, `gain`, `fade` | `audio-dsp/resample_*`, `audio-dsp/downmix_*`, `audio-dsp/upmix_*`, `audio-dsp/gain_*`, `audio-dsp/fade_in_out_f32` | Mediabunny's conversion docs explicitly support audio resampling, up/downmixing, and custom audio processing. The adapter currently forwards only a subset of audio options/features. |
| 3 | Missing `hls-aes128` encryption scheme | `demux/hls_aes128`, `encryption/hls_aes128_decrypt`, `encryption/hls_aes128_decrypt_eq_cleartext` | Current Mediabunny HLS docs say encrypted HLS AES-128 can be read when keys are supplied. The local adapter comment says HLS AES-128 was not exposed as a decrypt primitive in `1.48.0`; this is now a reconciliation target. |
| 3 | Missing `encryption:cenc-ctr-clear-output` feature | `encryption/cenc_ctr_decrypt`, `encryption/cenc_ctr_decrypt_eq_cleartext`, `encryption/perf_cenc_ctr_decrypt_throughput` | Focused validation against the current `cenc_ctr.mp4` fixture throws inside Mediabunny's CENC-CTR subsample decrypt path before remux. Keep the clear-output feature undeclared until the adapter or fixture layout can produce verified clear bytes. |
| 2 | Missing `fastStart:in-memory` | `streaming-output/mp4_faststart_in_memory`, `streaming-output/prop_faststart_in_memory_duration_invariant` | Mediabunny output-format docs list `fastStart: 'in-memory'`; the adapter already parses this option, but capabilities do not declare it. |
| 2 | Missing `alpha:transcode` | `transcode/vp9_alpha_to_vp8_keepalpha`, `transcode/vp9_alpha_to_vp9_keepalpha` | Mediabunny supports alpha preservation/removal in conversion. The adapter declares generic `alpha` but not the narrower transcode feature. |
| 1 | Missing `fanout` | `transcode/fanout_h264_abr_ladder` | Mediabunny natively supports track fan-out, but the suite `MediaBytes` contract can return only one blob. This requires a harness/contract change, not only a flag. |
| 1 | Missing `crop` | `transcode/h264_crop_center` | Mediabunny conversion docs list video cropping. |
| 1 | Missing `pad` | `transcode/h264_pad_letterbox_4x3_to_16x9` | Not a named one-field Mediabunny option, but implementable through custom video processing; should not be permanently accepted without an adapter attempt. |

Keep as confirmed N/A for Mediabunny unless new docs prove otherwise:

- AIFF/CAF input/output rows: Mediabunny's current supported-format list does not include AIFF or CAF.
- JPEG/PNG/WebP as media inputs: still non-media/image negative rows for this adapter.
- `crf`, `two-pass`: WebCodecs-style conversion does not expose x264-style CRF or two-pass encoding.
- `packets:dts`: current adapter/docs do not show a decode-timestamp packet surface equivalent to the suite requirement.
- `headerless` WebM live-stream output: not shown as a supported output mode by the adapter.

### 2. `ffmpeg.wasm@0.12.15`

High confidence reimplementation items:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 14 | Missing AIFF/CAF input/output support | AIFF rows in `audio-dsp`, `probe`, `demux`, `metadata`, `trim`; CAF probe row | FFmpeg supports broad demuxer/muxer coverage, and upstream FFmpeg format docs describe libavformat muxers/demuxers. The adapter's canonical mapping currently omits AIFF/CAF. |
| 10 | Missing audio DSP features: `resample`, `downmix`, `upmix`, `gain`, `fade` | Same audio-DSP shape as Mediabunny | FFmpeg filters include resampling/channel/gain/fade capabilities; these are implementation gaps in option mapping, not framework limits. |
| 15 | Missing video/filter features: `alpha`, `depth:10bit`, `flip`, `colorspace`, `crf`, `crop`, `pad`, `two-pass`, `tonemap` | Transcode/trim/decode feature rows | FFmpeg supports filtergraphs and encoding controls. Some depend on the vendored wasm build, but the adapter currently does not even attempt them. |
| 5 | Missing `metadata:write` | `metadata/write_*` rows | The adapter comment says FFmpeg can write tags and `remux()` honors tags. At audit time the runner dropped `options.tags` before calling `remux`; this was a runner contract gap, now addressed in the current worktree. |
| 4 | Missing `mux:vfr-timestamps` | VFR mux scenarios | FFmpeg can mux/copy timestamped streams; the adapter needs to preserve/declare VFR timestamp behavior. |
| 4 | Missing HLS input container | `probe/hls_*`, `demux/hls_*` | FFmpeg supports HLS in general, but this adapter writes a single file into MEMFS and cannot resolve sibling segments. Reimplementation requires multi-file fixture materialization or URL/WORKERFS handling. |
| 2 | Missing `decode:golden-rgba` | `performance/decode-fps`, `robustness/edge_open_gop_bframes_decode` | The adapter comments say `decodeFrames()` emits normalized RGBA digests matching the oracle path; the feature should be validated and declared if true. |
| 2 | Missing `fastStart:in-memory` | `streaming-output/mp4_faststart_in_memory`, invariant row | FFmpeg `movflags` can write faststart/fragmented MP4. The exact suite distinction between reserve and in-memory needs mapping. |
| 13 | Runtime NA for Opus encode reliability | Opus/WebM transcode and performance rows | FFmpeg's wasm build includes libopus in the documented build path, but local empirical behavior says traps or timeouts. This should be re-tested with timeouts/core selection before being treated as permanent `NA_ENGINE`. |

Keep as confirmed N/A for the current vendored wasm core:

- AV1 rows: the local adapter/dossier say the vendored core lacks libaom/dav1d; current Dockerfile evidence supports that unless a custom core is built.
- CENC/HLS decrypt rows: no adapter decrypt path exists for this build.
- Very large transcodes that exceed browser-wasm budget can remain N/A unless the benchmark budget or storage path changes.

### 3. `mp4box@2.3.0`

High confidence / medium confidence reimplementation items:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 53 | Missing operation `mux` | All `mux/*` rows plus `robustness/prop_demux_mux_roundtrip_eq` | MP4Box.js can add tracks/samples and write MP4. The local adapter leaves `mux` undeclared because the current harness does not feed `options.tracks`. This is a harness+adapter gap for MP4-output mux cases. |
| 56 | Missing `decodeFrames` / `seek` | `decode-seek/*` and audio-DSP decode rows | MP4Box itself does not decode, but official WebCodecs samples use MP4Box as the demuxer feeding `VideoDecoder`. If the suite's "mp4box engine" may include browser WebCodecs, these should be implemented. If the engine is intentionally "mp4box only", keep them N/A. |
| Subset of 45 | Missing operation `trim` | MP4/MOV trim cases only | MP4Box can seek/sample-select and write MP4, but no first-class trim API. Keyframe-aligned MP4 trim is a possible adapter implementation; frame-accurate/non-ISOBMFF trim remains N/A. |

Keep as confirmed N/A:

- Non-ISOBMFF input/output rows (`webm`, `mkv`, `ts`, `wav`, `flac`, `ogg`, `mp3`, `adts`, `aiff`, `caf`) are outside MP4Box.js scope.
- Transcode/decrypt remain unsupported by MP4Box itself.

### 4. `remotion-media-parser@4.0.479`

Reimplementation candidates:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 15 | Missing `mov`/`mkv` input containers | MOV/MKV probe/demux/metadata/performance rows | Current Remotion Media Parser docs list `.mov` and `.mkv` among major supported containers. The local adapter omits them because the parser collapses the family name and strict golden comparison would fail. Add suffix/input-based normalization rather than accepting permanent N/A. |
| 56 | Missing `decodeFrames` / `seek` | `decode-seek/*`, audio-DSP decode rows | Media Parser docs say it extracts samples compatible with WebCodecs and can be used for decoding. The current adapter is intentionally read-only, but the framework can support a WebCodecs-backed decode/seek path. |
| 2 | Missing `metadata:protected-tracks` | `probe/cenc_cbcs`, `probe/cenc_ctr` | Needs targeted check. If Remotion exposes encrypted track metadata, these are false N/A; if not, keep N/A. |

Keep as confirmed N/A:

- Remux/transcode/mux/trim/decrypt operation rows: Media Parser is not a writer/converter.
- AIFF/CAF/image rows.
- `pcm-f32` rows if the installed `4.0.479` build still throws on IEEE-float WAVE before metadata.

### 5. `web-demuxer@4.0.0`

Reimplementation candidates:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 56 | Missing read containers (`wav`, `flac`, `mp3`, `ts`, `hls`, `ogg`, `adts`, `aiff`, `caf`) | Probe/demux/metadata/robustness rows for those containers | Web-Demuxer is an FFmpeg-in-WASM demuxer and its docs describe broad multimedia demuxing. The adapter currently declares only `mp4`, `mov`, `mkv`, `webm`, with comments about some v4 packet-reader issues. Each omitted container should be probed directly before final N/A. |
| 2 | Missing `rotate` / `alpha` decode features | `decode-seek/decode_rotated_display_matrix`, `decode-seek/decode_vp9_alpha` | v4 release notes mention orientation/flip support; verify whether rotation/alpha can be surfaced. |

Keep as confirmed N/A:

- Transcode/remux/mux/trim/decrypt operation rows: Web-Demuxer is a demuxer/decoder-feed library, not a writer/converter.
- `packets:dts` if WebAVPacket truly exposes only presentation timestamps.

### 6. `platform@chrome-149`

Reimplementation candidates:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 19 | Missing video-only transform features (`fps`, `rotate`, `flip`, `crop`, `pad`, `alpha:transcode`, `fragmented`) | Mostly `transcode/*` feature rows | Raw browser APIs cannot remux, but canvas + MediaRecorder can implement several video-only transforms. Rows with audio requirements should remain N/A unless audio capture/mixing is solved. |
| 48 | Missing `wav` input container | Audio-DSP/probe/demux rows | Browser APIs can decode some audio through Web Audio/HTMLMediaElement, but the current platform adapter is video/container-demux oriented. Treat as optional reimplementation, not confirmed framework impossibility. |

Keep as confirmed N/A:

- Lossless remux/mux/trim/decrypt: raw platform APIs do not expose a general encoded-sample container writer or plaintext DRM export path.
- Audio-preserving transcode rows: the current MediaRecorder canvas-capture path is video-only and drops audio.
- Non-browser encoders such as CRF/two-pass are not platform APIs.

### 7. `remotion-webcodecs@4.0.479`

Reimplementation candidates:

| Rows | Current NA reason | Affected cases | Why this needs work |
| ---: | --- | --- | --- |
| 8 | Missing audio-DSP-ish features (`resample`, `downmix`, `upmix`, `gain`) | Audio-DSP rows | The package exports lower-level audio conversion helpers, but installed `convertMedia()` types do not expose full audio DSP controls. Worth a targeted adapter experiment. |
| 2 | Runtime NA for large fixture `bufferWriter` output | Large transcode rows | Docs expose `webFsWriter`/OPFS as the large-output path. The suite's `MediaBytes` contract currently drives in-memory output; this may need a writer strategy change. |
| Version-drift check | `trim`, `crop` | Trim/crop families | Current web docs mention trim/crop language, but installed `4.0.479` type declarations do not show first-class trim/crop options. Re-check after package upgrade before accepting these as permanent. |

Keep as confirmed N/A for installed `4.0.479`:

- Output containers other than `mp4`, `webm`, `wav`: current docs for `convertMedia()` list only those containers.
- `mux`: no public arbitrary `EncodedTracks` muxer.
- `decrypt`: no decrypt API.
- `trim`: no first-class installed option in `4.0.479` types.
- Many specialized encoder controls (`crf`, `two-pass`, `tonemap`, `fragmented`) are not exposed by installed package APIs.

### 8. `aibrush-media@dev`

All 551 rows are `NA_ENGINE` because the adapter is a deliberate placeholder with empty capabilities.

This is not a framework-support finding; it is a product implementation gap. If `aibrush-media` is intended to be a real benchmark contender in this suite, every family requires implementation. If it is only a reserved future slot, these rows are honest placeholder N/A and should be excluded from "framework cannot support this" statistics.

## Non-NA_ENGINE N/A Rows

These make up the rest of the 3,740 N/A-like cells and should not be counted as engine capability failures:

| Status | Rows | Meaning |
| --- | ---: | --- |
| `NA_ASSET` | 1,019 | Mostly missing fixture files or frame-bake/golden data. Top missing fixture is `h264_1080p_30s.mp4` with 233 rows. This is corpus/build work, not adapter support. |
| `NA_BROWSER` | 66 | Chromium/WebCodecs cannot encode requested audio codecs: `pcm-s16`, `vorbis`, `mp3`, `flac`, `pcm-s24`, `pcm-f32`. These are browser runtime limitations for WebCodecs-backed engines, not engine declaration errors. |

## Current Implementation Progress

Progress made in the current worktree after this report was written:

| Engine | Stored-run `NA_ENGINE` rows no longer stopped at engine declaration | What changed | Verification scope |
| --- | ---: | --- | --- |
| `mediabunny@1.48.0` | 16 | Declared `fastStart:in-memory`, alpha transcode, audio resample/downmix/upmix/gain/fade, crop, and pad capability. Implemented gain/fade through `ConversionAudioOptions.process`, crop through `ConversionVideoOptions.crop`, and pad/letterbox through `fit: 'contain'`. CENC-CTR clear-output export remains undeclared after focused validation threw in Mediabunny's subsample decrypt path on the current fixture. | Static negotiation against the stored run: 14 rows now negotiate, 2 alpha rows now move to `NA_BROWSER` under Chromium's alpha/WebCodecs gate; the 3 CENC clear-output rows remain implementation work. |
| `ffmpeg.wasm@0.12.15` | 37 | Added AIFF/CAF containers, `pcm-s24be`, audio DSP declarations and mapping (`resample`, `downmix`, `upmix`, `gain`, `fade`), `decode:golden-rgba`, `fastStart:in-memory`, `metadata:write` tag forwarding through the runner, and HLS playlist sidecar materialization for `.m3u8` inputs including AES-128 key files. | Static negotiation against the stored run for rows whose original reason was one of the changed declarations. The four HLS rows (`probe/hls_vod`, `probe/hls_aes128`, `demux/hls_vod`, `demux/hls_aes128`) were also verified in Chromium and all passed in `results/raw/chromium-2026-06-20T20-36-16-380Z.json`. Opus/runtime-NA rows are intentionally not counted as fixed. |
| `remotion-media-parser@4.0.479` | 15 | Declared MOV/MKV input containers and restored collapsed parser container identity from fixture id/mime for golden comparison. | Static negotiation against the stored run for MOV/MKV read rows. |

Total current progress: **68 stored-run `NA_ENGINE` rows are no longer classified as engine-declaration skips** by current code. This is not a blanket PASS claim; the four HLS rows now have a fresh Chromium PASS run, while the rest still require a fresh browser matrix run to separate PASS, FAIL, NA_BROWSER, and runtime `NotApplicableError`.

Verification performed:

- `bun run typecheck` passes.
- `bun run build` passes.
- Targeted static negotiation checks pass for the listed stored-run rows.
- Focused Chromium runtime run passed all four FFmpeg HLS rows: `probe/hls_vod`, `probe/hls_aes128`, `demux/hls_vod`, `demux/hls_aes128`.

Remaining high-confidence work:

- Mediabunny: HLS AES-128 decrypt primitive, fanout contract, and browser alpha policy/runtime validation.
- FFmpeg.wasm: video filter features (`alpha`, 10-bit/depth, flip, colorspace, CRF, crop, pad, two-pass, tonemap), VFR mux timestamp proof, and Opus reliability.
- MP4Box/WebCodecs/parser engines: mux contract and decode/seek policy decisions remain open.
- Web-Demuxer and platform read/transform under-declaration still need smoke tests before changing capabilities.

## Priority Backlog

1. Fix the reference engine first: Mediabunny audio DSP, HLS AES-128, CENC clear output implementation, `fastStart:in-memory`, and alpha transcode. This removes false N/A from the baseline engine and improves oracle coverage.
2. Fix FFmpeg.wasm feature mapping: AIFF/CAF, audio/video filters, metadata tag forwarding, VFR mux timestamps, `decode:golden-rgba`, and Opus reliability.
3. Add a real mux contract path: feed `EncodedTracks` into mux scenarios so MP4Box.js and other mux-capable engines can contest MP4 mux rows.
4. Decide whether parser engines are allowed to pair with WebCodecs for decode/seek. If yes, implement MP4Box, Remotion Media Parser, and Web-Demuxer decode/seek paths. If no, document those rows as intentionally parser-only.
5. Audit under-declared read containers for Web-Demuxer and Remotion Media Parser with direct smoke tests per container.
6. Separate fixture/corpus work from engine work: bake missing frames and restore/fetch missing media assets before interpreting the 1,019 `NA_ASSET` rows as support gaps.

## Sources Used

- Mediabunny supported formats and codecs: <https://mediabunny.dev/guide/supported-formats-and-codecs>
- Mediabunny conversion API: <https://mediabunny.dev/guide/converting-media-files>
- Mediabunny output formats: <https://mediabunny.dev/guide/output-formats>
- Mediabunny HLS encrypted content: <https://mediabunny.dev/guide/reading-hls>
- FFmpeg.wasm overview: <https://ffmpegwasm.netlify.app/docs/overview/>
- FFmpeg.wasm performance: <https://ffmpegwasm.netlify.app/docs/performance/>
- FFmpeg HLS demuxer source: <https://ffmpeg.org/doxygen/trunk/hls_8c_source.html>
- FFmpeg filters: <https://ffmpeg.org/ffmpeg-filters.html>
- FFmpeg formats: <https://ffmpeg.org/ffmpeg-formats.html>
- MP4Box.js repo/docs: <https://github.com/gpac/mp4box.js/>
- MP4Box.js TypeScript rewrite post: <https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/>
- Remotion WebCodecs docs: <https://www.remotion.dev/docs/webcodecs/>
- Remotion `convertMedia()` docs: <https://www.remotion.dev/docs/webcodecs/convert-media>
- Remotion Media Parser docs: <https://www.remotion.dev/docs/media-parser/>
- Remotion Media Parser samples docs: <https://www.remotion.dev/docs/media-parser/samples>
- Web-Demuxer docs/repo: <https://github.com/bilibili/web-demuxer> and <https://bilibili.github.io/web-demuxer/>
- W3C WebCodecs spec: <https://www.w3.org/TR/webcodecs/>
