# decode-seek/decode_extreme_fps_1

- **Family:** decode-seek
- **Fixture asset:** `fixtures/media/h264_1fps_30s.mp4` (H.264 / yuv420p in MP4, 183,419 bytes, 1 fps / 30 s synthetic edge clip)
- **Goldens:** `fixtures/golden/h264_1fps_30s.mp4.frames.json` (12 frame digests) + `.ssim.json` (per-frame downsampled luma signatures)
- **primaryMetric:** decodeFps
- **Oracle gate:** `ssim-psnr` (SSIM floor 0.96, looser cross-decoder floor per scenario notes)
- **passCount:** 5 of 7 (2 NA_ENGINE)

## Verdict

- **Best framework:** `web-demuxer@4.0.0`
- **Contested:** YES — 5 engines PASS (web-demuxer, platform, remotion-webcodecs, ffmpeg.wasm, mediabunny).
- **Decisive factor:** Among the engines with the *strongest* correctness (perfect SSIM), web-demuxer wins on the primary metric `decodeFps`. It is the only engine pairing top-tier correctness (SSIM min/mean = 1.0000, identical to platform) with the highest throughput (613.81 fps).
- **Margin over runner-up (platform):** decodeFps 613.81 vs 522.24 = **1.18x higher throughput**; wall median 48.875 ms vs 57.445 ms = **1.18x faster** wall. Correctness tie (both SSIM 1.0000).

Note: all five PASS results are `cached==true` and every bench metric has `n==1` (single sample, mad==0), so the 1.18x margin is real but rests on one measurement each — see caveats.

## Per-engine results

| Engine | Status | Oracles passed | wall median (ms) | decodeFps | peakMemory (B) | longtasks (ms) | Reason |
|---|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (SSIM 1.0000, 0/12 digest-exact) | 48.875 | 613.81 | 0 (not measured) | 19963 | cached previous PASS |
| platform@chrome-149 | PASS | ssim-psnr:pass (SSIM 1.0000, 0/12 digest-exact) | 57.445 | 522.24 | 67,534,880 | 9925 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (SSIM 0.9713 min / 0.9730 mean) | 67.080 | 447.23 | 83,950,644 | 4410 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (SSIM 0.9720 min / 0.9737 mean) | 69.080 | 434.28 | 158,032,643 | 874 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (SSIM 0.9718 min / 0.9734 mean) | 167.015 | 179.62 | 72,939,061 | 874 | cached previous PASS |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

This scenario is a **pixel-decode correctness + throughput** test on a degenerate-timing H.264-in-MP4 clip: 1 fps means very wide, sparse DTS/PTS spacing (≈1,000,000 µs between samples) over 30 s. The container is plain progressive MP4 (faststart, no fragments, no encryption), and the codec is baseline/main H.264 yuv420p, which Chromium's WebCodecs `VideoDecoder` can hardware-decode on the Apple M1 Max (ANGLE Metal). The oracle compares 12 decoded RGBA frames against committed golden frame digests and per-frame luma SSIM signatures.

**Correctness tier.** The `ssim-psnr` oracle (`src/core/oracles.ts:1688`) first attempts digest equality (`oracles.ts:1766`); when digests differ it falls back to downsampled-luma SSIM via `sink.getPixels` (`oracles.ts:1773-1786`) and gates on the *worst* frame, `minSsim >= t.ssimMin` (`oracles.ts:1823`). For web-demuxer and platform, the luma SSIM is `0.9999999993` (reported as 1.0000) across all 12 pairs — effectively pixel-identical to the golden decode. The other three PASS engines land at SSIM min ≈ 0.971–0.972, comfortably above the 0.96 floor but visibly off the golden due to different RGB-conversion / chroma-upsampling curves. So on **correctness strength**, web-demuxer and platform are co-leaders (perfect SSIM); the remaining three are a clear notch lower.

**Why web-demuxer beats platform (the tiebreak).** Correctness is tied, so the decision moves to performance, and decodeFps is the primaryMetric. web-demuxer's adapter (`src/engines/web-demuxer/adapter.ts:848`) runs a tight pipeline: the WASM demuxer supplies the `VideoDecoderConfig` (incl. extradata description) via `getDecoderConfig('video')` (`adapter.ts:853`), self-gates with `VideoDecoder.isConfigSupported()` (`adapter.ts:855-858`), then streams `EncodedVideoChunk`s straight from `d.read('video')` into a single `VideoDecoder` in a pipelined enqueue loop (`adapter.ts:887-896`) with no intermediate copy of the elementary stream. Timestamps already arrive in microseconds from the WASM layer, so there is no JS-side timestamp remapping. The result is 613.81 fps / 48.875 ms wall — the demux-once-feed-directly path has less per-frame JS overhead than the platform engine's `<video>`/MediaSource-adjacent plumbing, which incurs 522.24 fps / 57.445 ms. That is a 1.18x throughput and 1.18x wall advantage on identical pixels.

web-demuxer also wins the secondary tiebreakers: it does **not require COOP/COEP / SharedArrayBuffer** for this path (it is demux-WASM + browser WebCodecs, no threaded wasm), it is a **streaming** read rather than whole-file decode-then-buffer, and its decode pixels route through hardware WebCodecs (the M1 Max Metal decoder) just like platform. Its peakMemory is `0` because the harness did not capture a memory sample for this engine (not a true zero), so memory is not used in the ranking. Its longtasks figure (19,963 ms) is high, but longtasks is the lowest-priority bench metric and does not override a primaryMetric + correctness win.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost on perf):** Identical correctness (SSIM 1.0000) but 1.18x slower — 522.24 fps / 57.445 ms wall vs web-demuxer's 613.81 fps / 48.875 ms. Its `<video>→canvas` decode/render plumbing (env.configUsed.encode `<video>→canvas→MediaRecorder`) carries more per-frame overhead than the direct chunk-feed path. Real runner-up.
- **remotion-webcodecs@4.0.479 (PASS, weaker correctness + perf):** SSIM min 0.9713 (mean 0.9730) — passes the 0.96 floor but is the *lowest* SSIM of the field, indicating a different RGB-conversion path (offscreencanvas-2d pixel backend). Also slower at 447.23 fps / 67.080 ms.
- **ffmpeg.wasm@0.12.15 (PASS, weaker correctness + worst memory):** SSIM min 0.9720 (software wasm decode → digest proxy 0/12 exact). 434.28 fps / 69.080 ms wall, and by far the heaviest at peakMemory 158 MB (2.3x platform's footprint) — single-thread wasm decoder with no hardware acceleration.
- **mediabunny@1.48.0 (PASS, slowest):** SSIM min 0.9718 (correct but not golden-exact). Slowest decode by a wide margin: 179.62 fps / 167.015 ms wall — that is 3.4x slower wall than web-demuxer despite also using WebCodecs (its `streaming-lockstep` pipeline with `VideoSample.copyTo(RGBA)` serializes decode against rasterization).
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'decodeFrames'". Honest NA — it is a parser/demuxer, not a pixel decoder; it does not expose a frame-decode capability, so the runner correctly skips it rather than failing it.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'decodeFrames'". Honest NA — mp4box is a pure MP4 box parser/segmenter with no decode path; correctly skipped.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:230` (`id: 'decode_extreme_fps_1'`, asset `h264_1fps_30s.mp4`, container mp4, videoCodec h264, maxFrames 30, tolerances.ssimMin 0.96). Notes: "A.16 extreme fps (1 fps): low-rate timestamp spacing. Uses a slightly looser SSIM floor for cross-decoder RGB conversion differences on the synthetic edge clip." — legitimate gating rationale.
- **Fixture exists & is real:** `fixtures/media/h264_1fps_30s.mp4` present, 183,419 bytes — a genuine encoded H.264 MP4, not synthetic/empty/mock. Goldens `h264_1fps_30s.mp4.frames.json` (12 frame digests) and `.ssim.json` (per-frame luma sigs) exist and match the 12 `pairs` reported by every engine.
- **Winner adapter is genuine:** `src/engines/web-demuxer/adapter.ts:848-942` — real WASM demux (`getDecoderConfig`, `read('video')`) feeding a real `new VideoDecoder({...}).configure()/.decode()/.flush()` loop, rasterizing each `VideoFrame` to ImageData and computing a sha256 digest (`adapter.ts:933-935`). No canned output, no input→output copy, no golden short-circuit; unsupported codecs throw loudly (`adapter.ts:856-858`). Capability `decodeFrames: true` is honestly declared (`adapter.ts:628`).
- **Oracle is meaningful:** `src/core/oracles.ts:1688` performs digest-equality then real downsampled-luma SSIM (`downsampleLuma`/`sigSsim`, `oracles.ts:1782-1786`) against committed goldens, gating on the worst frame (`oracles.ts:1823`). Measurements are physically plausible: 12 pairs (== golden frame count), SSIM 0.971–1.000 across engines (cross-decoder spread is exactly what real RGB-conversion differences produce). Not trivially satisfiable — three engines land near the floor, demonstrating discrimination.
- **Caveat — PSNR proxy:** PSNR cannot be computed (golden ships no raw pixels), so the gate rests on SSIM and digest equality; `exactFrames==0` for all engines (digests differ due to RGBA-normalization curve), but the SSIM path is a real luma comparison, not smoke. This makes the gate strong-but-not-bit-exact.
- **Cached:** ALL five PASS results have `cached==true` ("cached previous PASS result") — reused, not re-run in this batch. The winner margin therefore reflects prior single-sample runs; staleness/reproducibility risk noted.
- **Verdict:** **REAL** — real fixture, real WASM-demux + WebCodecs implementation, meaningful golden-backed SSIM oracle with measured discrimination across engines.

## Confidence & caveats

- **Confidence:** medium. Correctness tie between web-demuxer and platform is unambiguous (both SSIM 1.0000), and the perf ordering is clear, but every metric is `n==1` (mad==0, p95==median) and all results are cached, so the 1.18x decodeFps/wall margin is single-sample evidence and could shift on a fresh re-run.
- The winner's `peakMemory` is `0` (not captured), so memory could not be used as a tiebreaker; if measured it might change secondary rankings (it would not overturn the primaryMetric + correctness win).
- `exactFrames==0` everywhere means the gate is luma-SSIM, not bit-exact pixels — strong for this cross-decoder scenario but weaker than a `decoded-frames-bitexact` gate would be.
- The two NA_ENGINE results (remotion-media-parser, mp4box) are honest capability declines, not under-declared decode support — both are parsers without a pixel-decode path.
