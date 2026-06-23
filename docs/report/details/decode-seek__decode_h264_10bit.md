# decode-seek/decode_h264_10bit

family: decode-seek | fixture asset: `h264_10bit_1080p_5s.mp4` (5.6 MB, real) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: 5 of 7 engines PASS (mediabunny, web-demuxer, platform, ffmpeg.wasm, remotion-webcodecs). 2 are NA_ENGINE (mp4box, remotion-media-parser).
- **Decisive factor: PERFORMANCE.** Correctness is comparable — all five clear the same single gate (`ssim-psnr`, SSIM floor 0.96) and mediabunny ties for the *best* correctness (SSIM ≈ 1.0000), so it is not beaten on the oracle. The tie is broken on the primaryMetric `decodeFps` and on `wall`.
- **Margin over runner-up (platform@chrome-149):** decodeFps 58.90 vs 46.86 = **1.26x faster decode**; wall 509.3 ms vs 640.2 ms = **1.26x faster wall**. Against the *next perfect-SSIM* engine web-demuxer: 58.90 vs 38.80 fps = **1.52x**. Against the absolute slowest passer ffmpeg.wasm (wasm): 58.90 vs 21.94 fps = **2.69x**.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true (SSIM 0.99999999994) | 509.31 | 58.90 | 0 (not measured) | 19963 | cached previous PASS result |
| platform@chrome-149 | PASS | ssim-psnr:true (SSIM 0.99999999999) | 640.24 | 46.86 | 793,871,113 | 4223 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (SSIM 0.99999999999) | 773.16 | 38.80 | 0 (not measured) | 632 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (SSIM 0.9695) | 831.33 | 36.09 | 0 (not measured) | 1017 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (SSIM 0.99997) | 1367.57 | 21.94 | 0 (not measured) | 1192 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

All bench rows are n==1 (single sample, mad==0, p95==median); throughputRealtime is not reported for this scenario — primaryMetric is decodeFps, with wall as the secondary discriminator.

## Why the winner wins (deep technical)

This scenario is an **A.4 10-bit-depth decode**: H.264 **High 10 profile (yuv420p10le)**, 1920×1080, 30 fps, ~8.76 Mbit/s video plus an AAC stereo track, in a plain (faststart) MP4 (`fixtures/golden/h264_10bit_1080p_5s.mp4.meta.json`). The operation is `decodeFrames` with `maxFrames: 30`; the gate is `ssim-psnr` with a deliberately loosened floor `ssimMin: 0.96` (scenario notes, `src/scenarios/decode-seek/index.ts:208-212`) because browser, wasm and WebCodecs paths apply *different 10-bit→8-bit conversion curves* while preserving frame content — so the test measures structural fidelity, not bit-exact pixels.

Correctness first: the oracle (`src/core/oracles.ts:1688`, `ssimPsnr`) pairs each candidate frame with the golden by index. With no committed raw golden pixels it uses **downsampled Rec.601 luma signatures** from `h264_10bit_1080p_5s.mp4.ssim.json` and computes per-frame `sigSsim` (`oracles.ts:1773-1786`), gating on the **worst** frame (`minSsim >= t.ssimMin`, line 1823). Mediabunny's measured `ssimMin = 0.9999999999994`, `ssimMean = 0.9999999999995` over 12 paired frames (`exactFrames: 0` — digests differ because of the 10-bit→8-bit curve, exactly as the notes predict). That is effectively a perfect structural match and ties the top of the field (platform/web-demuxer also ≈ 0.99999999999). So mediabunny is not out-ranked on correctness — it is at the ceiling.

Because correctness is comparable, the decision falls to performance, and here mediabunny is the clear leader on the primaryMetric: **decodeFps 58.90** and **wall 509.31 ms**, both best in the field (1.26x over platform, 1.52x over web-demuxer, 2.69x over ffmpeg.wasm). Mechanistically this comes from its decode path: `MediabunnyAdapter.decodeFrames` (`src/engines/mediabunny/adapter.ts:1330`) drives the library's `VideoSampleSink` over the video track (`adapter.ts:1387`) configured by `videoDecoderOptionsForTrack`, iterating `sink.samples()` and, for each untransformed sample, calling **`VideoSample.copyTo(..., { format: 'RGBA' })`** directly (`imageDataFromVideoSample`, `adapter.ts:1721-1754`) instead of round-tripping through a canvas. The configUsed confirms `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pixelBackend: "VideoSample.copyTo(RGBA)>canvas"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`. So mediabunny gets the hardware VideoDecoder (Apple M1 Max via ANGLE Metal) feeding a thin TS sink with a 4-slot canvas pool, and avoids the canvas-readback overhead that the platform path incurs — that is the FPS edge. Digests are sha256 over normalized RGBA (`digest.ts`) so they line up with the golden frame ordering used by the oracle.

One caveat on the win: mediabunny's `longtasks` median is **19963 ms**, far above every rival (platform 4223, ffmpeg.wasm 1192, web-demuxer 632). That is the lockstep main-thread decode monopolizing the event loop — it does not affect the decodeFps/wall result that decides this row, but it is the cost of the streaming-lockstep pipeline. Per the ladder, longtasks is a lower-priority performance metric than primaryMetric (decodeFps) and wall, both of which mediabunny wins; it does not overturn the verdict but is a real responsiveness wart.

## What each other framework did wrong

- **platform@chrome-149** — PASS, runner-up. Identical correctness (SSIM 0.99999999999) but slower: decodeFps 46.86 (0.80x of mediabunny) and wall 640.24 ms (1.26x slower). Also reports the only nonzero `peakMemory` = 793.9 MB (the `<video>`/WebGPU pixel pipeline `webgpu>webgl>offscreen2d`), the heaviest footprint here. Lost on the primaryMetric.
- **web-demuxer@4.0.0** — PASS. Best-tier correctness (SSIM 0.99999999999) but decodeFps 38.80 (0.66x) and wall 773.16 ms (1.52x slower). Lowest longtasks (632 ms) — most responsive — but loses the decisive decodeFps/wall metrics.
- **remotion-webcodecs@4.0.479** — PASS, but the **weakest passer**. SSIM 0.9695 / 0.9696 — barely above the 0.96 floor (the only engine that does not reach ≈1.0), evidence of a measurably different 10-bit→8-bit conversion curve in its pipeline (`backend: webcodecs`, `pixelBackend: offscreencanvas-2d`). Also slow: decodeFps 36.09 (0.61x), wall 831.33 ms. Would have failed a stricter floor.
- **ffmpeg.wasm@0.12.15** — PASS but slowest. SSIM 0.99997 (excellent), but single-thread wasm software decode gives decodeFps 21.94 (0.37x) and wall 1367.57 ms (2.69x slower) — no hardware VideoDecoder, no WebCodecs.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". **Honest NA** — MP4Box.js is a demuxer/parser, it has no pixel decoder, so it correctly does not claim `decodeFrames`. Not an under-declaration.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". **Honest NA** — the media-parser is a container/metadata parser without a frame decoder (the decode capability lives in the separate remotion-webcodecs engine, which did run). Correctly declared.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:202` (`id: 'decode_h264_10bit'`), asset `h264_10bit_1080p_5s.mp4`, container mp4, codec h264, `tolerances.ssimMin: 0.96`, notes at lines 209-212 give the gating rationale (cross-decoder 10-bit→8-bit curve divergence).
- **Fixture exists & is real:** `fixtures/media/h264_10bit_1080p_5s.mp4` = **5.6 MB** real MP4. Golden artifacts present and non-trivial: `...meta.json` (1080p/30fps H.264 High 10 + AAC), `...frames.json` (3.2k digests), `...packets.json` (43k), `...ssim.json` (79k of downsampled Rec.601 luma signatures). Not synthetic/empty/mock.
- **Oracle is real & non-trivial:** `ssim-psnr` at `src/core/oracles.ts:1688`. It loads golden luma signatures, computes candidate signatures from decoded pixels (`downsampleLuma`/`sigSsim`, lines 1773-1786), and gates on the **minimum** per-frame SSIM (line 1823), not the mean — not trivially satisfiable. Measurements are physically plausible: 12 paired frames, SSIM in [0.9695, 1.0], exactFrames 0 (consistent with lossy 10-bit→8-bit conversion across decoders). Note: this is a **perceptual proxy** with `exactFrames==0` (no bit-exact gate available) and a relaxed 0.96 floor, so it is correctness-meaningful but not the strongest rung of the ladder.
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:1330` (`decodeFrames`) → real `VideoSampleSink` over the video track (`adapter.ts:1387`), real `VideoSample.copyTo(RGBA)` (`adapter.ts:1721-1754`), sha256 digests (`digest.ts`). No canned output, no copy-input-to-output, no short-circuit to golden, no swallowed errors (sample.close() in finally; errors propagate).
- **Cached note:** **all 5 PASS rows have `cached: true`** ("cached previous PASS result"). The numbers were reused, not freshly re-run for this report — staleness risk applies to every engine here. The launcher-seeding caveat (stale PASS reuse) is relevant; a fresh run after clearing the raw + `.browser-cache` would confirm. The relative ordering (hardware-WebCodecs mediabunny > platform > web-demuxer > remotion-webcodecs > wasm) is internally consistent and physically sensible, lowering the practical concern.
- **Verdict: REAL.** Real 5.6 MB fixture + real mediabunny WebCodecs decode + real min-SSIM oracle. The PASS is genuine; the only softening factors are the perceptual (not bit-exact) gate and the cached-result reuse, neither of which indicates cheating.

## Confidence & caveats

- **Confidence: medium-high.** Code, fixture, golden, and oracle all validated end-to-end; verdict is a clean performance win on the primaryMetric with comparable top-tier correctness.
- **Caveats:** (1) every bench is **n==1** (mad 0, p95==median) — a 1.26x margin over platform is suggestive, not statistically robust; the 1.52x–2.69x gaps over web-demuxer/ffmpeg.wasm are more decisive. (2) All results are **cached** — re-run on cleared caches to confirm. (3) The gate is a **perceptual SSIM proxy at a relaxed 0.96 floor with exactFrames==0**, so this row certifies structural fidelity, not bit-exact 10-bit decode. (4) Mediabunny's longtasks (19963 ms) is a real main-thread-blocking cost not reflected in the decisive metrics — relevant for interactive use even though it does not change the winner.
