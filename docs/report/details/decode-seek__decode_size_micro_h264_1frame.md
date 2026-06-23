# decode-seek/decode_size_micro_h264_1frame

- Family: decode-seek
- Fixture asset: `fixtures/media/micro_h264_1frame.mp4` (320x240 H.264/AVC in MP4, single keyframe, 5.5 KB on disk — exists)
- primaryMetric: `decodeFps`
- passCount: 5 of 7 (2 NA_ENGINE)

## Verdict

- Best framework: **platform@chrome-149** (Chrome native WebCodecs `VideoDecoder` + inline MP4 demuxer).
- Contested: YES — 5 engines PASS the same `ssim-psnr` gate.
- Decisive factor: a two-stage ranking. (1) Correctness strength: platform and web-demuxer both score the highest possible perceptual SSIM **1.0000** against the committed luma signature, beating the three hardware-WebCodecs engines that landed ~0.971–0.972. (2) Among the two SSIM=1.0000 engines, performance breaks the tie: platform decodes at **205.97 fps** vs web-demuxer's **76.05 fps**.
- Margin over runner-up (web-demuxer): **2.71x** higher decodeFps (205.97 / 76.05), **2.71x** lower wall (4.855 ms vs 13.150 ms). Caveat: n==1 per engine (single sample, mad=0), so the perf margin is one-shot evidence, but the 2.7x gap is far larger than any plausible single-run jitter.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (SSIM 1.0000) | 4.855 | 205.97 | 0 (not measured) | 1227 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (SSIM 1.0000) | 13.150 | 76.05 | 0 (not measured) | 1017 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (SSIM 0.9713) | 5.380 | 185.87 | 0 (not measured) | 5077 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (SSIM 0.9720) | 12.285 | 81.40 | 0 (not measured) | 1012 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (SSIM 0.9718) | 15.445 | 64.75 | 0 (not measured) | 1192 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

(peakMemory and timeToFirstFrame have n==0 in the bench block for every engine — they were not captured for this micro single-frame case, so they cannot rank.)

## Why the winner wins (deep technical)

The operation is `decodeFrames(maxFrames=1)` on a one-frame H.264 (avc1) elementary stream wrapped in a faststart MP4. There are no B-frames and exactly one IDR keyframe, so the entire job is: parse the `moov` sample table, hand the single AVC access unit to a decoder configured from the `avcC` extradata, and rasterize the resulting `VideoFrame` to RGBA. This collapses to a *per-call overhead floor* benchmark (the scenario notes call it exactly that), so the winner is whoever has the leanest demux→configure→decode→raster path with the most colorspace-faithful output.

Correctness ladder. The gate is `ssim-psnr` (src/core/oracles.ts:1688). For this asset a committed golden exists — `fixtures/golden/micro_h264_1frame.mp4.frames.json` (one frame, sha256 `27864933…`, 320x240, baked by the platform engine) and `…ssim.json` (downsampled luma signatures). Because golden raw pixels are never committed, the oracle's PSNR path degrades to a digest-equality proxy and the real gate is the downsampled-luma SSIM (oracles.ts:1773-1789, gating on the worst frame at :1823). All five PASS engines report `exactFrames: 0` — i.e. nobody's normalized-RGBA sha256 reproduced the golden byte-for-byte, including the platform engine that baked the golden, which is expected: hardware/RGBA conversion is not bit-deterministic across runs. So the discriminator is the luma SSIM, and there platform and web-demuxer return **0.9999999994935933 ≈ 1.0000** while the three other decoders return **0.9713 / 0.9718 / 0.9720**. The ~0.028 SSIM deficit on the hardware-WebCodecs trio reflects a slightly different YUV→RGB conversion / chroma upsampling than the platform reference used for the luma sigs; the platform path and web-demuxer (which also rasterizes via the same `imageDataFromVideoFrame` straight-alpha 2D-canvas convention, web-demuxer/adapter.ts:933) match the reference luma almost perfectly. Per rule 4(a) the two SSIM=1.0000 engines outrank the ~0.971 trio on correctness strength, so the contest narrows to platform vs web-demuxer.

Performance tiebreak (rule 4b). Both finalists call the identical underlying Chrome `VideoDecoder`, so the gap is pure pipeline overhead. The platform adapter (src/engines/platform/decode.ts:89 `decodeWithWebCodecs`) demuxes the MP4 in-process with its own bundled parser, builds one `EncodedVideoChunk` directly from the in-memory sample (decode.ts:198-203), feeds it to a `VideoDecoder` configured straight from the parsed `avcC` description (decode.ts:103-115, keeping the description because `codecUsesDescription` returns true for avc1, decode.ts:77-83), then flushes and rasterizes (decode.ts:146-156). web-demuxer instead routes the bytes through its **emscripten/WASM FFmpeg demuxer** to obtain the `VideoDecoderConfig` and a streaming `ReadableStream` of chunks (web-demuxer/adapter.ts:852-894): `loadInput` boots the WASM module, `getDecoderConfig('video')` and `d.read('video').getReader()` cross the JS↔WASM boundary per packet. For a one-frame clip that WASM round-trip is the entire cost, and it shows: **205.97 fps vs 76.05 fps (2.71x)** and **4.855 ms vs 13.150 ms wall (2.71x)**. Platform also avoids COOP/COEP and has no WASM/SharedArrayBuffer dependency (env.configUsed shows `backend:webcodecs, hwAccel:true, pipeline:streaming`), which is the cleanest deployment profile of the field.

Against the ~0.971 trio, platform also wins on speed where it matters: remotion-webcodecs is the only other engine near platform's throughput (185.87 fps) but it (a) loses on correctness (0.9713, the lowest SSIM in the set) and (b) shows a 5077 ms long-task figure — ~4x platform's 1227 ms — indicating heavier main-thread blocking during its convert path. ffmpeg.wasm (81.40 fps) and mediabunny (64.75 fps) are both ~2.5–3x slower than platform and also sit in the 0.971 SSIM band.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS, tied on correctness (SSIM 1.0000) but lost the perf tiebreak: 76.05 fps vs platform 205.97 (0.37x), 13.150 ms vs 4.855 ms wall. Cause: its WASM-FFmpeg demux + JS↔WASM streaming-reader bridge (adapter.ts:852-894) adds per-packet boundary cost that dominates a single-frame decode, even though the actual pixel decode uses the same Chrome VideoDecoder.
- **remotion-webcodecs@4.0.479** — PASS but ranked below on correctness: SSIM **0.9713** (the worst of the five PASSes), and longtasks 5077 ms (highest, ~4x platform). Its YUV→RGB raster path (`offscreencanvas-2d`, env.configUsed) diverges most from the reference luma sigs and it blocks the main thread far longer.
- **ffmpeg.wasm@0.12.15** — PASS but lower correctness (SSIM **0.9720**) and 81.40 fps (0.40x platform). The pure-WASM decode+raster is both slower and slightly less colorspace-faithful to the platform-baked reference.
- **mediabunny@1.48.0** — PASS but lowest throughput (64.75 fps, 0.31x platform; 15.445 ms wall, the slowest) and SSIM **0.9718**. Its `VideoSample.copyTo(RGBA)→canvas` lockstep pipeline (env.configUsed) is correct but the heaviest per-call path here.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". HONEST NA — mp4box.js is an MP4 box parser/segmenter; it has no pixel decoder, so not declaring decodeFrames is correct, not an under-declared capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". HONEST NA — the media-parser is a demux/metadata library; decoding pixels is the job of its sibling remotion-webcodecs (which did run). Correct non-declaration.

## Anti-cheat validation

- Scenario definition: src/scenarios/decode-seek/index.ts:334 (`id: 'decode_size_micro_h264_1frame'`), built from `SIZE_LADDER_CASES` into a real decodeFrames scenario at index.ts:296-308 with `oracles: DECODE_ORACLES`, `primaryMetric: 'decodeFps'`, `tolerances: { ssimMin: 0.96 }`. Notes (index.ts:341-344) state the looser 0.96 floor is for "cross-decoder RGB conversion differences on a one-frame edge" — a documented, narrow rationale, not a blanket loosening.
- Fixture: `asset: 'micro_h264_1frame.mp4'` → `fixtures/media/micro_h264_1frame.mp4` exists (5.5 KB, real H.264/MP4). Not synthetic/empty/mock.
- Golden: `fixtures/golden/micro_h264_1frame.mp4.frames.json` (sha256 27864933…, 320x240, baked in a real browser 2026-06-21) + `…ssim.json` luma sigs. `pending: false`. Real committed reference.
- Oracle: src/core/oracles.ts:1688 `ssimPsnr`. Performs a real per-frame comparison: digest equality first (exactFrames), else downsampled-luma SSIM vs committed sigs (oracles.ts:1773-1786), gating on the WORST frame ≥ ssimMin (oracles.ts:1823). Measurements are physically plausible: 1 pair, 1 frame, SSIM in [0.9713, 1.0000] — exactly the spread you expect across real H.264 decoders. Not trivially satisfiable (the 0.96 floor still discriminates; a garbage frame would fall well below it).
- Winner adapter: src/engines/platform/decode.ts:89-163. Genuinely calls `VideoDecoder.isConfigSupported`/`configure`/`decode`/`flush` on a real `EncodedVideoChunk` built from the demuxed AVC sample (decode.ts:198-203), rasterizes the actual `VideoFrame` (decode.ts:148), digests the RGBA (decode.ts:154). No canned output, no input→output copy, no short-circuit to golden, no swallowed error reported as success (decode errors throw, decode.ts:217-220).
- Cached note: the winner's result has **cached==true** ("cached previous PASS result"), as do all 5 PASS rows. Staleness risk: the numbers were reused from a prior run, not re-executed this pass. The relative ordering (SSIM tiers, 2.7x perf gap) is robust to that, but the absolute fps/ms figures should be treated as last-known-good rather than fresh.
- Verdict: **REAL** — real fixture + real committed golden + genuine WebCodecs implementation + a discriminating SSIM oracle. The only asterisk is the cached evidence (see Confidence).

## Confidence & caveats

- Confidence: HIGH on the winner pick. Two independent rankings agree: platform is in the top correctness tier (SSIM 1.0000) AND fastest in that tier (2.71x over the other SSIM=1.0000 engine, and faster than every other PASS too).
- Caveat 1 — cached results: all PASS rows are `cached==true`; figures are reused, not re-run this pass. Per the launcher seeding caveat, a fully fresh run would re-validate the absolute numbers.
- Caveat 2 — n==1: every bench metric has a single sample (mad=0, p95==median). The 2.71x perf margin dwarfs plausible single-run jitter, but it is one-shot evidence.
- Caveat 3 — exactFrames==0 everywhere: the gate rests on luma-SSIM, not bit-exact pixels (golden ships no raw pixels). This is a perceptual proxy, but a tight one (0.96 floor, worst-frame gate) and is the strongest correctness signal available for decode in this suite. The SSIM=1.0000 tie between platform and web-demuxer is genuine luma identity to the reference, not a loose pass.
- Caveat 4 — peakMemory/timeToFirstFrame not captured (n==0) for this micro case, so memory could not contribute to ranking.
