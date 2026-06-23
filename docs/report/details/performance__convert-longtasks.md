# performance/convert-longtasks

- family: performance
- fixture asset: `h264_1080p_30s.mp4` (BIG_READ_GOLDEN, 31 MB, H.264/AAC 1080p 30s)
- operation: `transcode` → WebM / VP9 / Opus @ 320×180 (CONVERT_320x180)
- primaryMetric: `longtasks` (main-thread blocking ms, PerformanceObserver, Chromium-only)
- oracles (gates): `ssim-psnr` (ssimMin 0.97) + `playback-smoke`
- passCount: 2 of 7 (CONTESTED)

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 PASS).
- **Decisive factor: PERFORMANCE.** Both PASS engines are correctness-equivalent on the gating oracles (both pass `ssim-psnr` at SSIM ≈ 0.9997, both pass `playback-smoke`, both with `exactFrames==0` so the same perceptual-proxy strength). The tie therefore breaks on the primary metric `longtasks`, where mediabunny blocks the main thread for far less time.
- **Margin over runner-up (remotion-webcodecs):**
  - longtasks (primary): **874 ms vs 4277 ms → 4.89× lower** main-thread blocking.
  - wall: **1764.5 ms vs 4450.8 ms → 2.52× faster**.
  - framesPerSec: **510.1 vs 202.2 → 2.52× higher** throughput.
  - Both measured at n==1 (single sample, warmup=1, mad=0) — see caveats: large gap but weak statistics.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | framesPerSec | longtasks (ms) | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:true (ssimMin 0.999679, exact 0/12), playback-smoke:true | 1764.53 | 510.05 | **874** | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (ssimMin 0.999695, exact 0/12), playback-smoke:true | 4450.77 | 202.21 | 4277 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only, drops audio; cannot produce requested audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | transcode NA: libopus encode in vendored wasm core traps/exceeds timeout; Opus encode not a reliable path |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The workload is a heavy cross-codec downscale-transcode: decode H.264 (AVC, 1080p, in an MP4/faststart container) → scale to 320×180 → re-encode video as VP9 and audio as Opus → mux into WebM. Both PASS engines used the same backend class (`env.configUsed.backend == "webcodecs"`, `hwAccel == "prefer-hardware"`, `wasmThreads == 0`, no COOP/COEP, on an Apple M1 Max via ANGLE Metal). So this is not a hardware-vs-wasm contest; it is a pipeline-architecture contest measured by how much the convert blocks the main thread (`longtasks`).

mediabunny wins decisively on `longtasks` (874 ms vs 4277 ms, 4.89×). The mechanism is its Conversion engine: the adapter drives `mb.Conversion.init(opts)` then `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848` and `:855`, invoked from `transcode()` at `:1271`). Per the adapter's own design notes (`adapter.ts:48-51`) the Conversion API runs read→decode→encode→mux in **streaming lockstep with automatic backpressure** (queue depth auto-managed, `env.configUsed.pipeline == "streaming-lockstep"`, `queueDepth == "auto"`), and a `CanvasSink` ring buffer (`canvasPoolSize == 4`) keeps the scaling/pixel path bounded. Each decode/scale/encode step is a small chunk handed off cooperatively rather than one monolithic synchronous loop, so individual main-thread tasks stay short — hence low cumulative longtask time despite real work being done (510 fps effective video throughput, wall 1764 ms).

remotion-webcodecs does the same logical conversion but on a `streaming-backpressure` pipeline whose convert runs on the **main thread** (`env.configUsed.worker == "convert=main-thread; extractFrames/parse=worker-capable"`, `pixelBackend == "offscreencanvas-2d"`, `writer == "bufferWriter"`). Because the convert path itself is not offloaded to a Worker, its decode→canvas-2d-scale→encode steps coalesce into long synchronous bursts on the main thread → 4277 ms of longtasks (4.89× worse) and 4450 ms wall (2.52× slower) at 202 fps. This is exactly the §8.5 "Worker-offload" claim the scenario was built to expose (`resource.ts:12-16`): mediabunny's auto-backpressured pipeline keeps the main thread responsive; remotion-webcodecs' main-thread convert does not.

Correctness is genuinely a tie and cannot break the contest: both produce a perceptually faithful downscale. The `ssim-psnr` oracle compares the re-decoded output against in-browser-decoded reference frames (no committed pixel golden for a transcode; `oracles.ts:1737-1738`, `ssimVsReferenceSource`) and gates on the **worst** frame (`oracles.ts:1823`). mediabunny: ssimMin 0.999679 / ssimMean 0.9997039 over 12 frames; remotion-webcodecs: ssimMin 0.999695 / ssimMean 0.9997079 over 12 frames — both far above the 0.97 floor (`CONVERT_TOLERANCES`, `_shared.ts:119`), essentially identical quality. Both have `exactFrames==0` (no digest-identical frames, expected since this is a cross-codec re-encode and no raw-pixel golden exists), so neither earns a stronger bit-exact tier; they sit equally on the perceptual-proxy rung of the ladder. With correctness tied, the primary metric `longtasks` is decisive — and mediabunny wins it by ~4.9×.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost):** correct output (ssimMin 0.999695, playback-smoke pass) but runs the convert on the main thread (`worker: convert=main-thread`), producing 4277 ms longtasks vs mediabunny's 874 ms (4.89× worse) and 4450.8 ms wall vs 1764.5 ms (2.52× slower). Pure performance loss on the primary metric.
- **platform@chrome-149 (NA_ENGINE):** its transcode path is `<video>→canvas→MediaRecorder` — a video-only capture pipeline that drops audio, so it cannot emit the required Opus audio track. NA looks **honest**: it is a genuine architectural limitation of MediaRecorder canvas-capture, not an under-declared capability.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** declares transcode generally, but the vendored wasm core's libopus encode traps or exceeds the suite timeout, so Opus encode is not declared as reliable for this WebM/Opus target. NA looks **honest** (a real, documented wasm-core defect for the specific output codec), not a dodge.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare operation `transcode`. Honest — it is a parser/demuxer, not an encoder.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare `transcode`. Honest — demux-only library, no encode path.
- **mp4box@2.3.0 (NA_ENGINE):** does not declare `transcode`. Honest — ISOBMFF box parser/muxer, no codec re-encode capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/resource.ts:59-74` (`convertLongtasks`, id `performance/convert-longtasks`), input `BIG_READ_GOLDEN`, options `CONVERT_320x180`, oracles `['ssim-psnr','playback-smoke']`, primary `longtasks`.
- **Fixture:** input resolves to `h264_1080p_30s.mp4` (`_shared.ts:71`). Confirmed present at `fixtures/media/h264_1080p_30s.mp4`, **31 MB** real H.264/AAC 1080p 30s clip — a real, substantial media file, not synthetic/empty/mock. Goldens exist (`fixtures/golden/h264_1080p_30s.mp4.{meta,packets,ssim,frames}.json`), including the `.ssim.json` luma signatures used as reference.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts` — `transcode()` at `:1271` builds real `ConversionVideoOptions`/`ConversionAudioOptions` (probing encodability with `canEncodeVideo`, resolution-aware bitrate to clear VP9 hardware minimums, `:499`-`:520`) and runs `mb.Conversion.init` (`:848`) + `conversion.execute()` (`:855`), pulling bytes from a real `BufferTarget` (`:819`-`:837`). No canned output, no input→output copy, no golden short-circuit, no swallowed errors (invalid conversions throw at `:849-853`). Genuine library transcode.
- **Oracle:** `ssimPsnr` at `src/core/oracles.ts:1688`; for transcode (no committed pixel golden) it routes to `ssimVsReferenceSource` (`:1737-1738`), decoding the SOURCE in-browser and comparing downscaled luma signatures, gating on the worst frame at floor 0.97 (`:1823`). This is a real perceptual comparison against decoded reference media, not trivially satisfiable. Measurements (12 pairs, ssimMin ≈ 0.9997) are physically plausible for a clean downscale.
- **Verdict: WEAK-GATE.** The implementation, fixture, and ranking are all REAL, but the *correctness gate* is a perceptual proxy: `ssim-psnr` here has `exactFrames==0` (no bit-exact comparison possible without a pixel golden) and is backed by `playback-smoke` (a smoke oracle). The PASS is genuine but not a strong correctness proof. Crucially, the contest is decided on the **performance** primary metric (longtasks) which is the real point of this scenario, and the gap (4.89×) is large — so the winner selection is sound even though the gate itself is proxy-strength.
- **Cached note:** the winner's result has `cached==true` ("cached previous PASS result") — it was reused, not re-run this session. The runner-up is also `cached==true`. Numbers reflect a prior run; staleness risk applies symmetrically to both PASS engines, so the relative ranking is unaffected, but absolute longtask/wall figures may be stale.

## Confidence & caveats

- **Confidence: medium.** The winner-selection logic is robust: a 4.89× longtasks gap and 2.52× wall gap on correctness-tied engines is unambiguous.
- Both PASS results are **n==1** (single sample, warmup=1, mad=0, p95==median) — no spread information, so the magnitude (not direction) of the gap is weakly supported statistically.
- Both winners' results are **cached** — figures are from a prior run, not freshly re-measured.
- The gate is **proxy-strength** (perceptual SSIM + smoke, exactFrames==0); a fast-but-subtly-wrong convert that still scored SSIM ≥ 0.97 would not be caught by a bit-exact check. No evidence of that here (SSIM ≈ 0.9997 is near-perfect).
- All five NA engines are **honestly NA** (three undeclared transcode, two real codec-path limitations); none looks like an under-declared capability being hidden to dodge the test.
