# performance/convert-webm-resize-320x180

- **Family:** performance
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (~31 MB, H.264/AAC 1080p, 30 s) → transcode to WebM/VP9/Opus, resize 320×180
- **Primary metric:** framesPerSec (higher is better)
- **Pass count:** 2 / 7 (mediabunny, remotion-webcodecs)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, remotion-webcodecs), each satisfying the single gating oracle `ssim-psnr` with effectively identical perceptual quality.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both SSIM min ≈ 0.9997, well above the 0.97 floor; both `exactFrames=0`). mediabunny wins on the primary metric: **518.73 fps vs 300.71 fps = 1.73× faster encode throughput**, and on wall clock **1734.99 ms vs 2992.91 ms = 1.72× faster** (0.58× the wall time).
- **Margin over runner-up:** 1.73× framesPerSec, 1.72× wall. Caveat: both samples are `n=1` (mad=0, single sample), so the margin is a single-shot measurement; magnitude (~1.7×) is large enough to be decisive despite weak statistics.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:pass (SSIM min 0.999679) | 1734.99 | n/a (fps 518.73) | n/a | n/a | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (SSIM min 0.999695) | 2992.91 | n/a (fps 300.71) | n/a | n/a | cached previous PASS |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode NA: vendored libopus encode traps/exceeds timeout; Opus encode not declared reliable |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only, drops audio, cannot produce requested audio track |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (parser-only) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (MP4-only box muxer) |

Note: the shard's `bench` block carries only `framesPerSec`, `wall`, and `encodeFps` for this scenario; `throughputRealtime`, `peakMemory`, and `longtasks` were not measured (no entries), so those table cells are n/a. For both passing engines `framesPerSec == encodeFps` (518.73 / 300.71 respectively).

## Why the winner wins (deep technical)

This is a **decode-resize-reencode-remux** pipeline, not a copy/remux: H.264 (AVC) elementary stream in an MP4 container with an AAC audio track must be fully decoded, the luma/chroma planes downscaled from 1920×1080 to 320×180 (a 36:1 area reduction), then re-encoded as **VP9** video plus **Opus** audio and muxed into a **WebM/Matroska** container. Every frame crosses a real decoder → scaler → encoder boundary, so throughput is dominated by encode cost — which is exactly why the scenario scores `framesPerSec`/`encodeFps`.

mediabunny runs this through its **Conversion API** end to end: `Conversion.init(opts)` then `conversion.execute()` (src/engines/mediabunny/adapter.ts:848-855), with the output sunk into a `BufferTarget` whose bytes are returned via `mediaBytes()` (adapter.ts:856-868). The video block is built by `buildVideoOptions` (adapter.ts:546+): width=320, height=180 are set (adapter.ts:556-557), and because mediabunny rejects width+height without a `fit` algorithm, the adapter injects `fit='fill'` (adapter.ts:586) to honor the literal 320×180 target. Crucially it pre-validates the encode config with `VideoEncoder.isConfigSupported` for VP9 before committing (adapter.ts:619-653), so it never hands the Conversion a config Chrome would reject mid-run. The configUsed confirms the fast path: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`, `canvasPoolSize: 4`. The lockstep streaming pipeline plus a 4-slot canvas ring buffer keeps VRAM bounded while feeding the hardware VP9 encoder back-to-back, yielding **518.73 fps**.

remotion-webcodecs uses the same native-WebCodecs strategy (`convertMedia` with `hardwareAcceleration: 'prefer-hardware'`, configUsed `backend: "webcodecs"`, `pipeline: "streaming-backpressure"`), and its pixel resize runs on **OffscreenCanvas 2D** (`pixelBackend: "offscreencanvas-2d"`) — the library's only pixel rung (it has no WebGPU/WebGL path). It produces correct output (SSIM min 0.999695) but at **300.71 fps**. The 1.73× gap is mechanistic: mediabunny's lockstep scheduler with a dedicated canvas pool and `VideoSample.copyTo(RGBA)>canvas` readback (configUsed.pixelBackend) drives the encoder with less per-frame scheduling/backpressure overhead than remotion's backpressure-throttled main-thread convert (`worker: "convert=main-thread"`). Both ran on the same Apple M1 Max / ANGLE Metal GPU, decoded the same H.264 source, and emitted the same VP9/Opus WebM, so the delta is pipeline efficiency, not codec or container differences.

Correctness is a genuine tie: the `ssim-psnr` oracle (src/core/oracles.ts:1688) compared 12 candidate frames against per-frame downsampled-luma signatures (the golden-luma branch, oracles.ts:1773-1786; PSNR proxy via digest equality reported as "0/12 exact" because lossy VP9 re-encode never produces a bit-identical normalized frame). Both engines scored mean ≈ 0.9997 and min ≈ 0.9997, far above the scenario's loosened floor of 0.97 (set because 1080p→180p + codec change is aggressive; src/scenarios/performance/index.ts:160). With correctness indistinguishable, performance is the tiebreaker and mediabunny wins outright.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed (correct VP9/Opus output, SSIM min 0.999695) but **lost on throughput**: 300.71 fps vs 518.73 fps (1.73× slower) and 2992.91 ms vs 1734.99 ms wall (1.72× slower). Its OffscreenCanvas-2D-only resize and backpressure-throttled main-thread convert pipeline are slower than mediabunny's lockstep + canvas-pool path.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE. The vendored wasm libopus encoder traps or exceeds the suite timeout, so Opus encode is not declared a reliable transcode path. This NA looks **honest**: the scenario explicitly requires `audioCodecs: ['aac','opus']` output and ffmpeg.wasm cannot complete the Opus encode; declaring NA rather than emitting a broken/timed-out file is correct.
- **platform@chrome-149** — NA_ENGINE. The platform encode path is `<video>→canvas→MediaRecorder`, which is video-only and silently drops audio; it cannot produce the requested Opus audio track. **Honest** NA — the scenario's audio requirement genuinely exceeds the MediaRecorder canvas-capture capability.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `transcode`. Honest — web-demuxer is a demux-only library with no encoder.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `transcode`. Honest — media-parser is a read/parse-only sibling; encode lives in remotion-webcodecs.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `transcode`. Honest — mp4box is an ISO-BMFF (MP4) box parser/muxer with no codec encode and no WebM output.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/performance/index.ts:143-164 (`id: 'performance/convert-webm-resize-320x180'`, `op: 'transcode'`, `input: BIG_READ_ASSET`, CONVERT_OPTS = container webm / video vp9 320×180 / audio opus; oracles `['ssim-psnr']`; tolerances `ssimMin: 0.97`).
- **Fixture exists:** `BIG_READ_ASSET = 'h264_1080p_30s.mp4'` (index.ts:73); `fixtures/media/h264_1080p_30s.mp4` confirmed present, ~31 MB real H.264/AAC 1080p clip. Not synthetic/empty/mock.
- **Oracle:** src/core/oracles.ts:1688 `ssimPsnr`. Real per-frame downsampled-luma-signature SSIM comparison (oracles.ts:1773-1786), gated on the worst frame at the 0.97 floor (oracles.ts:1823). Measurements are physically plausible for a 36:1 lossy downscale-transcode: 12 pairs, SSIM min 0.999679 (mediabunny) / 0.999695 (remotion), exactFrames 0 (expected — lossy VP9 yields no bit-identical frames).
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1271 (`transcode`), real `Conversion.init`/`execute` at adapter.ts:848-855, real BufferTarget byte extraction at adapter.ts:856-868, real width/height resize + `fit='fill'` at adapter.ts:556-586, real VP9 encode-config pre-check via `VideoEncoder.isConfigSupported` at adapter.ts:619-653. No canned output, no input→output copy, no golden short-circuit, no swallowed-error success.
- **Verdict:** **REAL.** Real 31 MB fixture, real WebCodecs-backed decode-resize-reencode-mux via the library's Conversion API, and a meaningful perceptual oracle. The only softness is that this is a perceptual (SSIM) gate rather than bit-exact — appropriate and unavoidable for a lossy cross-codec transcode — and the floor is loosened to 0.97 for the aggressive downscale; the measured 0.9997 clears it by a wide margin, so the gate is not trivially satisfiable here.
- **Cached note:** Both passing engines have `cached: true` ("cached previous PASS result"). The winner was REUSED, not re-run in this batch — staleness risk exists. The relative ordering (mediabunny 1.73× faster) is consistent and large, but the absolute fps/wall numbers are from a prior run.

## Confidence & caveats

- **Confidence:** medium-high. The win is unambiguous on the primary metric (1.73×) and on wall (1.72×), correctness is a clean tie, and the winner's code path is verified real.
- **Caveats:** (1) Both engines' bench samples are `n=1` (mad=0, single sample, single warmup) — the magnitude is decisive but statistical strength is weak. (2) Both results are `cached=true` (stale-reuse risk). (3) The gate is perceptual SSIM, not bit-exact (correct for lossy transcode, but a weaker correctness ladder rung than bit-exact/structural oracles). (4) No `peakMemory`/`longtasks`/`throughputRealtime` were captured for this scenario, so the comparison rests entirely on fps and wall.
