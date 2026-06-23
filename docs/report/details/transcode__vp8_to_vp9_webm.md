# transcode/vp8_to_vp9_webm

family: transcode | fixture asset: `fixtures/media/recorder_headerless.webm` (192,412 bytes, VP8 video / Opus audio, headerless MediaRecorder capture) | primaryMetric: wall (ms) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Status: **CONTESTED** — 2 engines PASS (`mediabunny`, `remotion-webcodecs@4.0.479`) with the identical oracle set (`ssim-psnr`, `playback-smoke`), both achieving SSIM min ≈ 1.0000.
- Decisive factor: **main-thread responsiveness (longtasks)**. Correctness is a dead heat (same oracles, both ssimMin ≈ 1.0000, both `exactFrames=0`), so the tiebreak is performance. remotion-webcodecs is marginally faster on wall (86.99 ms vs 91.13 ms = **1.05x**) but blocked the main thread for **2055 ms of long tasks vs mediabunny's 159 ms — a 12.9x worse blocking profile**, and it reported no peakMemory (n=0) while mediabunny stayed at a measured 22.95 MB. For an in-browser transcode the 5% wall edge is dwarfed by a 12.9x main-thread-jank regression, so mediabunny wins.
- Margin over runner-up: wall 0.95x (slightly slower), throughputRealtime 0.95x (33.84x vs 35.45x), longtasks **0.077x (12.9x less blocking)**, peakMemory measured (22.95 MB) vs unmeasured.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:true, playback-smoke:true | 91.13 ms | 33.84x | 22,949,689 B (22.95 MB) | **159 ms** | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true, playback-smoke:true | 86.99 ms | 35.45x | 0 (n=0, not measured) | 2055 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in vendored wasm core traps/times out; Opus encode not declared as reliable transcode path |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only, drops audio; cannot produce requested audio track |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a full re-encode within the WebM/Matroska container: **VP8 → VP9 video** plus **Opus → Opus audio** (the scenario at `src/scenarios/transcode/index.ts:561-575` pins `toVideo: 'vp9'`, `toAudio: 'opus'`, `opts.container: 'webm'`). Because the source codecs differ from the targets, this is a genuine decode→re-encode→mux, not a sample-copy remux. The fixture is a headerless MediaRecorder capture, so the engine must also resolve the WebM Segment/Track structure without a clean front-loaded header.

mediabunny drives this through its first-party Conversion API: `transcode()` at `src/engines/mediabunny/adapter.ts:1271` builds a `ConversionOptions` with both a video block (`buildVideoOptions`, line 1302) and an audio block (`buildAudioOptions`, line 1303), then calls `runConversion` (`adapter.ts:842`) which does `Conversion.init(opts)` (line 848), checks `conversion.isValid` (rejecting if no usable output track survives), and `conversion.execute()` (line 855). The decoded VP8 frames are re-encoded to VP9 by the platform `VideoEncoder` under `configUsed.backend="webcodecs"` with `hwAccel="prefer-hardware"`, and Opus is re-encoded by the `AudioEncoder`; muxing is into a fresh `BufferTarget` (`adapter.ts:819`/`1289`). Crucially the config runs `configUsed.pipeline="streaming-lockstep"` with a bounded `canvasPoolSize:4` CanvasSink ring-buffer — read→decode→encode→mux are interleaved with backpressure, which is exactly why its long-task footprint is only **159 ms**. On an Apple M1 Max (ANGLE Metal) it sustained encodeFps 1020.5 and 33.84x realtime, all without SharedArrayBuffer or COOP/COEP (`coopCoep:"not-required"`).

The gating oracle is `ssim-psnr` (`src/core/oracles.ts:1688`). Since this transcode has no committed pixel golden, the oracle takes the reference-source branch: it re-decodes mediabunny's output WebM with the platform decoder and compares against the in-browser-decoded **source** frames (§5.2 path, `ssimVsReferenceSource`). The shard records `pairs:12, exactFrames:0, ssimMean:0.9999992, ssimMin:0.9999984` against the scenario tolerance `ssimMin:0.97` (`index.ts:571`). SSIM min 0.999998 is comfortably above 0.97 — the VP9 re-encode is visually lossless relative to the VP8 source. `exactFrames:0` is expected and correct here: VP8 and VP9 are different codecs, so no decoded frame can be bit-identical; the proxy correctly falls back to luma-signature SSIM rather than digest equality. `playback-smoke` independently confirms a real `<video>` element decoded and played frames of the output, proving the muxed WebM is structurally valid and playable (not merely byte-shaped).

remotion-webcodecs (`src/engines/remotion-webcodecs/adapter.ts:521`) implements the same operation genuinely via `convertMedia` (line 615) with a buffer writer, declares `videoCodecs:[...,'vp8','vp9',...]` (line 260), and passed the identical oracles (ssimMin 0.9999979, pairs 12, exactFrames 0). It is even ~5% faster on wall (86.99 ms) and throughput (35.45x, encodeFps 1069). But its `configUsed.pipeline="streaming-backpressure"` on the convert=main-thread path produced **2055 ms of long tasks** — a 12.9x larger main-thread stall than mediabunny — and it surfaced no peakMemory sample (bench n=0). Correctness being equal, the runner-evaluated tiebreak (after primaryMetric, longtasks is the responsiveness axis) decisively favors mediabunny: a transcode that freezes the UI for 2 seconds is a worse browser citizen than one that costs 4 ms more wall time but yields the main thread.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed (real `convertMedia` VP8→VP9/Opus re-encode, ssimMin 0.9999979 ≥ 0.97). Lost the tiebreak on responsiveness: longtasks 2055 ms vs mediabunny 159 ms (12.9x worse) and peakMemory not captured (n=0). Its 1.05x wall/throughput edge does not offset a 12.9x main-thread-blocking regression.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE (honest). Reason: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path. The target audio is Opus, so the engine genuinely cannot complete this specific case — a defensible self-declared limitation, not an under-declaration.
- **platform@chrome-149** — NA_ENGINE (honest). Its transcode path is `<video>→canvas→MediaRecorder`, which captures only the video canvas and drops audio; it physically cannot emit the requested Opus audio track. Correct NA rather than a silent video-only fake.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). Demux-only library; does not declare the `transcode` operation. No encoder/muxer exists in it.
- **mp4box@2.3.0** — NA_ENGINE (honest). MP4 box parser/muxer; does not declare `transcode` and has no video codec encoder. Correct NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). Parser-only; does not declare `transcode`. Correct NA (sibling lib remotion-webcodecs is the encoder).

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:561-575` (`id: 'vp8_to_vp9_webm'`, `asset: 'recorder_headerless.webm'`, from VP8/Opus WebM to VP9/Opus WebM, tolerances ssimMin 0.97 / psnrMinDb 36).
- Fixture: `fixtures/media/recorder_headerless.webm` — exists, 192,412 bytes, real captured VP8/Opus WebM (headerless MediaRecorder output). Not synthetic/empty/mock.
- Oracle: `ssim-psnr` at `src/core/oracles.ts:1688` (reference-source branch `ssimVsReferenceSource`, gate on worst-frame `minSsim >= t.ssimMin`); `playback-smoke` corroborates real playback. The SSIM compares the re-decoded output against in-browser-decoded source frames — a real perceptual comparison, not a trivially-true gate. Measurements are physically plausible: 12 paired frames, ssimMin 0.9999984 (near-lossless VP9 re-encode), exactFrames 0 (correct: cross-codec frames can't be digest-identical).
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271` (`transcode`) → `runConversion` `adapter.ts:842` (`Conversion.init`/`isValid`/`execute`) → real WebCodecs VideoEncoder(VP9)+AudioEncoder(Opus) muxed to a fresh `BufferTarget`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (it throws on invalid conversion / missing track).
- Verdict: **REAL** — real fixture file, genuine first-party re-encode through mediabunny's Conversion API into WebCodecs, and a meaningful perceptual oracle (SSIM 0.97 gate) plus playback smoke. The PASS reflects an actual VP8→VP9/Opus transcode.
- Cached note: mediabunny's result has `cached:true` ("cached previous PASS result", startedAt 2026-06-22T13:51:19Z); remotion-webcodecs is also `cached:true`. Both numbers were reused, not freshly re-run, so the exact timing/longtasks figures carry staleness risk. The correctness verdict and the large (12.9x) longtasks gap are robust to that risk; the wall margin (5%) is within plausible cache drift.

## Confidence & caveats

- Confidence: **medium-high**. The winner determination is solid on correctness (tie) and on the decisive longtasks margin (12.9x is far outside noise). The two caveats: (1) both PASS results are cached, so timings are not from a fresh run; (2) ssim-psnr uses the digest-proxy/reference-source path (`exactFrames=0`, PSNR unavailable) rather than a committed pixel golden — a perceptual proxy, not bit-exact. The gate (SSIM≥0.97, actual 0.999998) is nonetheless strong evidence of a faithful transcode.
- The bench n=1 (single sample, mad=0, p95=median) for both engines means the wall/throughput numbers are single observations; the 5% wall edge for remotion is weak evidence, but the conclusion does not rest on it.
- remotion's peakMemory n=0 means we cannot compare memory directly; mediabunny's measured 22.95 MB is at least a real, bounded figure consistent with its poolSize-4 ring buffer.
