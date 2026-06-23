# performance/encode-fps

- **family:** performance
- **fixture asset:** `h264_1080p_30s.mp4` (BIG_READ_GOLDEN, 31 MB, exists in `fixtures/media/`)
- **operation / target:** `transcode` — re-encode at SOURCE 1920×1080 to **WebM / VP9 / Opus** (encoder-bound, no scaler)
- **primaryMetric:** `encodeFps` (higher is better)
- **passCount:** 2 of 7

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (remotion-media-parser source + @remotion/webcodecs encoder).
- **Contested:** YES — two engines PASS (`remotion-webcodecs`, `mediabunny@1.48.0`) with identical correctness evidence.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both: ssim-psnr SSIM mean ≈ 1.0000 / min ≈ 1.0000 over 12 frames, `exactFrames:0`; playback-smoke pass). remotion-webcodecs is faster on the primaryMetric and on every secondary timing metric.
- **Margin over runner-up (mediabunny):** encodeFps **164.46 vs 136.63 fps = 1.20× higher**; wall **5472.57 ms vs 6587.28 ms = 1.20× faster**; throughputRealtime **5.48× vs 4.55× = 1.20× higher**. All measurements are **n=1** (mad=0, p95==median), so the margin is real but single-sample evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | **PASS** | ssim-psnr:✓, playback-smoke:✓ | 5472.57 | 5.48× | n/a | n/a | cached previous PASS (encodeFps 164.46) |
| mediabunny@1.48.0 | PASS | ssim-psnr:✓, playback-smoke:✓ | 6587.28 | 4.55× | n/a | n/a | cached previous PASS (encodeFps 136.63) |
| platform@chrome-149 | NA_ENGINE | — | — | — | n/a | n/a | MediaRecorder canvas-capture is video-only, drops audio; cannot produce the requested Opus audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | n/a | n/a | libopus encode in vendored wasm core traps / exceeds suite timeout; Opus encode not a reliable path |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare operation 'transcode' (no encoder/muxer) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare operation 'transcode' (read-only parser) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare operation 'transcode' (demux/probe only) |

(No `peakMemory` or `longtasks` metrics were recorded for this scenario; bench carries only `encodeFps`, `framesPerSec`, `throughputRealtime`, `wall`.)

## Why the winner wins (deep technical)

The operation is a **same-resolution cross-codec re-encode**: decode H.264 in MP4, then encode VP9 video + Opus audio into a WebM container at the source 1920×1080. Because there is no downscale, the **VP9 encoder is the bottleneck**, not the scaler — exactly the intent stated in the scenario notes (`src/scenarios/performance/decode-encode-seek.ts:62-92`). The metric `encodeFps` therefore measures raw encoder throughput on the M1 Max.

Both PASS engines run on the same hardware-accelerated WebCodecs substrate (`env.configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, M1 Max via ANGLE Metal), neither requires COOP/COEP, and neither uses wasm threads (`wasmThreads:0`). So the contest is decided inside the encode pipeline architecture, not the codec backend.

remotion-webcodecs wins by **1.20×** on encodeFps (164.46 vs 136.63 fps) and wall (5472.57 vs 6587.28 ms). The mechanistic reason is the pipeline shape recorded in `env.configUsed`:
- remotion-webcodecs: `pipeline:"streaming-backpressure"` with `queueDepth:"waitForQueueToBeLessThan"` and a `bufferWriter`. The convert path (`src/engines/remotion-webcodecs/adapter.ts:521` `transcode()` → `:580` `convert()` → `:615` `wc.convertMedia(...)`) drives @remotion/webcodecs' native pipeline, which feeds the VideoEncoder under explicit queue-depth backpressure (`waitForQueueToBeLessThan`) rather than a fixed depth. It also pre-probes duration/fps (`adapter.ts:600`) to size the output in one pass, and warms the VideoEncoder before the measured run (`adapter.ts:283-296`), so the codec is resident and the queue stays saturated — maximizing encoder utilization and yielding the higher steady-state fps.
- mediabunny: `pipeline:"streaming-lockstep"` with a fixed-ish `canvasPoolSize:4` and `VideoSample.copyTo(RGBA)>canvas` pixel transfer. The lockstep coupling (decode → copyTo RGBA → canvas → encode in step) and the RGBA round-trip through a canvas pool add per-frame latency between decode and encode, which lowers encoder occupancy and gives the measured 136.63 fps / 6587 ms.

Correctness is genuinely equal and equally strong-at-the-pixel-level but **weak as a gate**: there is no committed pixel golden for a VP9 transcode, so ssim-psnr validates the re-decoded output against the in-browser-decoded source (`src/core/oracles.ts:1737` → `ssimVsReferenceSource` at `:1842`). Both engines score SSIM mean ≈ 1.0000 / min ≈ 1.0000 (remotion ssimMin 0.99999997, mediabunny ssimMin 0.99999950) over 12 frames, but `exactFrames:0` — i.e. zero bit-exact frames; this is a **perceptual proxy**, not bit-exact, so it cannot break the tie on correctness. Hence the tie falls through to performance, and remotion-webcodecs takes it on every timing axis.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed with identical correctness (SSIM ≈ 1.0, exactFrames 0, playback-smoke), but LOST on performance: encodeFps 136.63 vs 164.46 (0.83×), wall 6587.28 vs 5472.57 ms (1.20× slower), throughputRealtime 4.55× vs 5.48×. Cause: `streaming-lockstep` + `VideoSample.copyTo(RGBA)>canvas` round-trip lowers encoder occupancy vs remotion's `streaming-backpressure` queue.
- **platform@chrome-149** — NA_ENGINE (honest). Its only encode path is `<video>→canvas→MediaRecorder`, which is video-only canvas-capture and drops audio; the scenario requires an **Opus audio track**, so it cannot satisfy the request. Capability-honest NA, not an under-declaration.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE (honest). libopus encode in the vendored wasm core traps or exceeds the suite timeout; the engine declines to declare Opus encode as a reliable transcode path rather than risk a crash/hang. Plausible: pure-wasm single-thread Opus encode is the known weak spot.
- **mp4box@2.3.0** — NA_ENGINE, does not declare `transcode`. Confirmed honest: `src/engines/mp4box/adapter.ts:949` `transcode()` throws (mp4box is a parser/box-mux only, no decode/encode).
- **remotion-media-parser@4.0.479** — NA_ENGINE, does not declare `transcode`. Honest: `src/engines/remotion-media-parser/adapter.ts:552-553` throws "no encoder, no muxer" (read-only parser).
- **web-demuxer@4.0.0** — NA_ENGINE, does not declare `transcode`. Honest: `src/engines/web-demuxer/adapter.ts:1051-1052` throws "transcode not supported (no encoder/muxer)" (demux/probe only).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/decode-encode-seek.ts:70-93` (`id: 'performance/encode-fps'`). Input = `BIG_READ_GOLDEN` = `h264_1080p_30s.mp4` (`src/scenarios/performance/_shared.ts:71`). Options request real cross-codec encode: container webm, video vp9 @1920×1080, audio opus. Gating notes (`:90-92`) describe an encoder-bound, no-downscale re-encode.
- **Fixture existence:** `fixtures/media/h264_1080p_30s.mp4` exists, **31 MB** real H.264/MP4 — not synthetic/empty/mock.
- **Winner implementation real:** `src/engines/remotion-webcodecs/adapter.ts:521` `transcode()` maps the codecs and calls `convert()` (`:580`), which invokes `wc.convertMedia({...videoCodec, audioCodec, writer:bufferWriter})` at `:615` — a genuine @remotion/webcodecs encode through the native VideoEncoder/AudioEncoder, output bytes returned via `result.save()` (`:629`). No canned output, no input→output copy, no golden short-circuit, no error swallowing (unsupported codecs throw at `:537`/`:550`).
- **Oracle real:** ssim-psnr at `src/core/oracles.ts:1688`; transcode (no committed pixel golden) routes to `ssimVsReferenceSource` (`:1842`), which re-decodes the engine output with the platform decoder and computes real SSIM/PSNR against the in-browser-decoded SOURCE. SSIM mean is the GATE (≥0.98 here); PSNR is advisory because the reference resampler differs. Measurements are physically plausible (12 frame pairs, SSIM ≈ 0.99999, which is what a correct same-res re-encode should score).
- **Gate strength caveat:** This is a **perceptual proxy**, not bit-exact: `exactFrames:0` and the floor is SSIM 0.98 — strong at discriminating a broken transcode (notes cite ~0.84 for a wrong frame) but it is not a crypto/bit-exact gate. Combined with playback-smoke (smoke-only), the correctness evidence is real but mid-strength.
- **Cached:** Winner result is `cached:true` ("cached previous PASS result") — reused, not freshly re-run this session; per launcher caveat there is mild staleness risk, but the metrics and oracle measurements are concrete and internally consistent. Runner-up (mediabunny) is also `cached:true`.
- **Verdict:** **REAL** — real 31 MB H.264/MP4 fixture, genuine convertMedia/WebCodecs encode, meaningful (if perceptual-proxy) SSIM oracle with plausible measurements.

## Confidence & caveats

- **Confidence: medium.** The winner is unambiguous on every timing metric and the implementations/oracle are verified real, but: (1) all benches are **n=1** (mad=0, p95==median), so the 1.20× margin is single-sample; (2) both PASS results are **cached**, not re-run this session; (3) the correctness gate is a **perceptual SSIM proxy with exactFrames:0**, so it cannot itself separate the two PASS engines — the win rests entirely on encode throughput. A multi-sample re-run would harden the ranking.
