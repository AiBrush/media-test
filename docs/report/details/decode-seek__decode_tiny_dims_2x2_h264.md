# decode-seek/decode_tiny_dims_2x2_h264

family: decode-seek | fixture asset: `video_2x2_h264.mp4` (2×2 yuv420p H.264 in MP4, 30 fps, ~2 s) | primaryMetric: decodeFps | passCount: 5 / 7

## Verdict

- Best framework: **platform@chrome-149** (Chrome WebCodecs `VideoDecoder`).
- Contested: **YES** — 5 of 7 engines PASS the `ssim-psnr` gate.
- Decisive factor: correctness is a 3-way tie at the top (platform, web-demuxer, mediabunny all land SSIM ≈ 1.0000), so the headline `decodeFps` breaks the tie. Platform is fastest.
- Margin over runner-up: **1585.7 vs 1342.3 decodeFps = 1.18× faster** than mediabunny (the next SSIM≈1.0 engine), and **2.12× faster** than web-demuxer (748.0 fps). Wall median 5.045 ms vs mediabunny 5.96 ms (1.18× lower). Caveat: n=1 per metric, mad=0 — single-shot timing, so the throughput margin is weak evidence; the correctness/SSIM ordering is the robust part.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | decodeFps | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (SSIM 0.99999557) | 5.045 | 1585.73 | 30,417,427 | 874 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (SSIM 0.99998533) | 5.96 | 1342.28 | 0 (not measured) | 632 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (SSIM 0.98200) | 5.675 | 1409.69 | 0 (not measured) | 4707 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (SSIM 0.99999557) | 10.695 | 748.01 | 0 (not measured) | 19963 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (SSIM 0.98108) | 6.575 | 1216.73 | 37,761,929 | 5077 | cached previous PASS |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

primaryMetric is decodeFps (higher better). peakMemory is only sampled by platform and remotion-webcodecs; "0" rows mean the metric was not captured, not that memory was zero.

## Why the winner wins (deep technical)

The operation is `decodeFrames` over a degenerate 2×2 yuv420p H.264 clip in an MP4 (faststart `isom`, in-band AVC config / `avcC` description out-of-band). The scenario caps at `maxFrames: 8` and gates on `ssim-psnr` with a locally-loosened floor `ssimMin: 0.97` (src/scenarios/decode-seek/index.ts:264-276). The scenario `notes` explains the loosened floor: at 2×2, a single chroma upsample / YUV→RGB rounding step is a large fraction of the entire luma signature, so cross-decoder RGB-conversion deltas are expected — hence the gate is perceptual SSIM, not bit-exact digest.

Platform decodes through Chrome's native `VideoDecoder`. The adapter (src/engines/platform/adapter.ts:422-456) reads the bytes, runs its inline MP4 demuxer (`buildDecodeInput`), and feeds the AVC samples to `decodeWithWebCodecs` (src/engines/platform/decode.ts). For avc1 it keeps the `avcC` description (`codecUsesDescription`, src/engines/platform/decode.ts:77-83) and configures `prefer-hardware` (env.configUsed.hwAccel=true, backend "webcodecs"). Each decoded `VideoFrame` is rasterized and the `ImageData` retained for `getPixels` (src/engines/platform/decode.ts:26-40), which is exactly what the SSIM oracle pulls. Because Chrome's H.264 decoder + canvas raster path reproduces the reference conversion almost exactly, platform scores **ssimMin = 0.99999557** against the 12-frame, 256-value (side=16) Rec.601 luma golden signatures (fixtures/golden/video_2x2_h264.mp4.ssim.json). The oracle (src/core/oracles.ts:1688-1833) computes a candidate luma signature via `downsampleLuma`/`sigSsim` per frame and gates on the worst frame (`minSsim >= t.ssimMin`, line 1823).

Among the engines that tie on correctness (platform, web-demuxer, mediabunny all ≈ 1.0000), the runner ranks on the family headline `decodeFps`. Platform is **1585.73 fps** vs mediabunny **1342.28** (1.18×) and web-demuxer **748.01** (2.12×). The native `VideoDecoder` path avoids any wasm/library re-decode overhead and uses hardware accel on the Apple M1 Max (ANGLE Metal); mediabunny's pure-TS ESM core (configUsed.coreBuild "pure-ts-esm", also WebCodecs but with its own VideoSample.copyTo→canvas raster) is marginally slower, and web-demuxer pays a much heavier per-frame cost (longtasks 19,963 ms, wall 10.7 ms). Platform also has the cleanest config posture: no COOP/COEP, wasmThreads 0, sharedArrayBuffer false (configUsed), so it needs no cross-origin isolation to run.

Note this is a perceptual-proxy win, not bit-exact: every engine reports `exactFrames: 0` (digest equality never holds at 2×2 because of the documented chroma/RGB rounding), so the PSNR=∞ branch (oracle line 1803) is never taken and the gate rests on SSIM alone. The win is real but the gate is a proxy — see anti-cheat.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on throughput only. SSIM 0.99998533 (effectively tied), but decodeFps 1342.28 vs platform 1585.73 (0.85×); wall 5.96 vs 5.045 ms. Genuine WebCodecs decode via its pure-TS core; simply slower than the native path. n=1 so the gap is soft.
- **ffmpeg.wasm@0.12.15** — PASS but weaker correctness: SSIM 0.98200, well below the 1.0 trio — its software YUV→RGB conversion diverges more from the reference at 2×2. decodeFps 1409.69 (still > mediabunny) but longtasks 4707 ms (single-thread wasm jank). Correctness deficit drops it below the SSIM≈1.0 engines.
- **web-demuxer@4.0.0** — PASS, SSIM 0.99999557 (tied for best correctness) but slowest: decodeFps 748.01 (2.12× slower than platform), wall 10.695 ms, longtasks 19,963 ms (heaviest of all). Wins correctness, loses decisively on the headline metric.
- **remotion-webcodecs@4.0.479** — PASS but weakest correctness: SSIM 0.98108 (lowest of the five), offscreencanvas-2d raster + prefer-hardware(+software fallback). decodeFps 1216.73, longtasks 5077 ms. Lower SSIM keeps it out of the top tier.
- **remotion-media-parser@4.0.479** — NA_ENGINE, honest. It is a parser that emits encoded samples only and has no decoder (src/engines/remotion-media-parser/adapter.ts:556-557 throws "no decoder; emits encoded samples only"); `decodeFrames` is not declared in capabilities. Correct NA, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE, honest. Pure MP4 demuxer with no decoder (src/engines/mp4box/adapter.ts:953-954 throws "no decoder — pair with WebCodecs"); `decodeFrames` not declared. Correct NA.

## Anti-cheat validation

- Scenario: src/scenarios/decode-seek/index.ts:264-276 (`id: 'decode_tiny_dims_2x2_h264'`, asset `video_2x2_h264.mp4`, container mp4, codec h264, maxFrames 8, tolerances.ssimMin 0.97). The `notes` give a sound physical rationale for the loosened floor.
- Fixture: `fixtures/media/video_2x2_h264.mp4` EXISTS (2.7 kB real H.264/MP4, not synthetic/empty). Goldens exist and are real: `fixtures/golden/video_2x2_h264.mp4.ssim.json` (12 frames × 256-value side=16 Rec.601 luma sigs), `.meta.json` (2×2, h264, 30 fps, 6348 b/s), `.frames.json`, `.packets.json`.
- Winner adapter: src/engines/platform/adapter.ts:422-456 calls the real Chrome `VideoDecoder` via src/engines/platform/decode.ts (configure → decode → raster → retained ImageData for getPixels). No canned output, no copy-input, no short-circuit to golden, no error-swallow-to-pass. Genuine implementation.
- Oracle: src/core/oracles.ts:1688-1833 (`ssimPsnr`). It loads the committed golden luma signatures, derives candidate signatures from real decoded pixels, computes per-frame `sigSsim`, and gates on the worst frame ≥ 0.97. It is a REAL comparison, not trivially satisfiable. BUT it is a perceptual proxy: digest equality (PSNR=∞) is never reached here (`exactFrames: 0` for all engines, plausible at 2×2), so the gate is SSIM-only. The measurements (SSIM 0.981–1.0000, 8 paired frames) are physically plausible for real H.264 decode.
- Verdict: **WEAK-GATE**. The fixture is real, the winner's decode is a genuine native WebCodecs path, and the oracle does a real golden comparison — but the gate is a perceptual SSIM proxy with `exactFrames == 0` and a loosened 0.97 floor, so the PASS is real yet not a bit-exact correctness proof. The floor is well-justified by the scenario notes, which is why this is WEAK-GATE rather than SUSPECT.
- Cached note: ALL 7 results have `cached: true` ("cached previous PASS result"). The evidence was reused, not re-run this invocation. Staleness risk is low (deterministic decode of a fixed fixture) but the single-shot timings (n=1, mad=0) should not be over-read.

## Confidence & caveats

- Correctness ordering (platform/web-demuxer/mediabunny ≈ 1.0000 > ffmpeg 0.982 > remotion-webcodecs 0.981) is solid and robust.
- The decodeFps margin (platform > mediabunny by 1.18×) rests on n=1 samples with mad=0 — a single timed run. Treat the throughput win as suggestive, not definitive; the correctness tie is what makes the headline metric the decider.
- All results cached; the gate is a perceptual SSIM proxy (WEAK-GATE), not bit-exact. Confidence: medium.
