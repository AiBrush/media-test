# performance/convert-peak-memory

- **family:** performance
- **fixture asset:** `h264_1080p_30s.mp4` (BIG_READ_GOLDEN, 31 MB, 1080p H.264/AAC, faststart moov, CRF20 closed GOP -g 60)
- **operation:** `transcode` MP4(H.264/AAC) → WebM(VP9/Opus) @320×180 (heavy 1080p→180p cross-codec downscale)
- **primaryMetric:** `peakMemory` (lower-better) — secondary metrics `framesPerSec`, `wall`
- **passCount:** 2 of 7 (mediabunny@1.48.0, remotion-webcodecs@4.0.479)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, remotion-webcodecs) with **correctness that is statistically indistinguishable** (SSIM min 0.9997 each, 12 paired frames each, exactFrames=0 each, playback-smoke pass each).
- **Decisive factor:** The declared primary metric `peakMemory` is **unmeasurable in this run** — both PASS engines report `peakMemory.n==0`, `median==0`, `samples==[]` (the run was not cross-origin-isolated, so `measureUserAgentSpecificMemory()` produced no sample; the scenario documents this as honest-NA, never zero). With the primary metric a tie-at-NA and correctness tied, the decision falls to the secondary performance metrics: **wall** and **framesPerSec**.
- **Margin over runner-up:** mediabunny wall median **1894.64 ms** vs remotion-webcodecs **3681.01 ms** → **1.94× faster wall**. framesPerSec **475.02** vs **244.50** → **1.94× higher encode throughput**. Both metrics are single-sample (`n==1`, `mad==0`, `p95==median`), so the evidence is one-shot and the margin is wide and consistent across both independent metrics.

## Per-engine results

| engine | status | oracles passed | wall median | framesPerSec | peakMemory | reason |
|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | ssim-psnr:pass (min 0.9997), playback-smoke:pass | **1894.64 ms** | **475.02 fps** | n=0 / NA (not COI) | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (min 0.9997), playback-smoke:pass | 3681.01 ms | 244.50 fps | n=0 / NA (not COI) | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested Opus audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | transcode NA: vendored wasm libopus encode traps or exceeds suite timeout; Opus encode not a reliable path |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | engine does not declare operation 'transcode' |

`longtasks` is not a metric for this scenario (it is the sibling `performance/convert-longtasks` case); omitted from the table.

## Why the winner wins (deep technical)

This case is a full re-encode pipeline: demux H.264 from MP4, hardware-decode 1080p frames, downscale to 320×180, **VP9** re-encode, **Opus** audio re-encode, and mux into a **WebM** (Matroska/EBML) container. There is no copy/remux fast-path possible because both the video codec (H.264→VP9) and audio codec (AAC→Opus) change and the resolution changes — every video frame and audio packet is genuinely re-encoded.

**The primary metric does not separate the two engines.** The scenario's `primaryMetric` is `peakMemory`, but `measureUserAgentSpecificMemory()` only yields a sample under a cross-origin-isolated context (COOP/COEP). This run was not cross-origin-isolated, so both PASS engines have `bench.peakMemory = { n:0, median:0, samples:[] }` — an honest NA, exactly as `src/scenarios/performance/resource.ts:8-10` describes ("peakMemory materializes only under cross-origin-isolated Chromium … elsewhere the sample is null → that cell is honestly NA, never zero"). Because neither engine produced a finite peakMemory sample, the leaderboard cannot rank on the declared dimension; the tie is broken by the gating/secondary metrics that *do* have samples.

**Correctness is a dead heat.** Both engines pass the same two oracles with near-identical measurements: mediabunny `ssimMin 0.999679`, `ssimMean 0.999704`; remotion `ssimMin 0.999695`, `ssimMean 0.999708`; both over 12 paired frames; both `exactFrames=0` (expected — a cross-codec H.264→VP9 downscale can never be bit-exact, so the digest-equality PSNR-∞ branch in `src/core/oracles.ts:1803` is unreachable and the gate rests on the SSIM signature comparison against the 0.97 floor in `CONVERT_TOLERANCES`, `src/scenarios/performance/_shared.ts:119`). Both clear 0.97 by a huge margin (0.9997). Correctness strength is therefore equal: same oracle ladder rung (perceptual proxy), same tolerance, same exactFrames=0.

**Performance is the decider, and mediabunny wins both secondary metrics by ~1.94×.** mediabunny's adapter drives the conversion through mediabunny's native `Conversion.init/.execute` API (`src/engines/mediabunny/adapter.ts:848-855`), a pure-TypeScript/ESM core with **no WASM and no SharedArrayBuffer** (`env.configUsed.coreBuild: "pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`). It runs a `streaming-lockstep` pipeline with `prefer-hardware` WebCodecs decode and a `canvasPoolSize:4` for the `VideoSample.copyTo(RGBA)>canvas` resize path. mediabunny completes the full 30 s clip in **1894.64 ms at 475.02 fps**.

remotion-webcodecs uses `convertMedia` (`src/engines/remotion-webcodecs/adapter.ts:615-627`) through its `bufferWriter`, a `streaming-backpressure` pipeline that throttles via `waitForQueueToBeLessThan`, with convert pinned to the **main thread** (`env.configUsed.worker: "convert=main-thread; …"`). It is correct and uses the same WebCodecs hardware decode, but takes **3681.01 ms at 244.50 fps** — 1.94× slower wall and half the encode throughput. The gap is consistent across both independent secondary metrics, which raises confidence despite each being a single sample. Mechanistically, mediabunny's tighter lockstep loop and lean canvas pool keep the WebCodecs decoder/encoder queues saturated, whereas remotion's backpressure-throttled, main-thread-bound convert leaves the hardware encoder under-fed for this 320×180 target (the encoder is small relative to per-frame JS orchestration overhead, so main-thread scheduling dominates).

Tiebreakers also favor mediabunny: both use hardware WebCodecs (no wasm), but mediabunny explicitly requires **no COOP/COEP** and carries no WASM core, a smaller/simpler deployment surface than remotion's buffer-writer + media-parser stack.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASالسED with equal correctness but LOST on performance: 3681.01 ms wall (1.94× slower than mediabunny's 1894.64 ms) and 244.50 fps (0.51× mediabunny's 475.02 fps). Main-thread-bound, backpressure-throttled convert under-feeds the hardware encoder for the small 320×180 target.
- **platform@chrome-149** — NA_BROWSER-style honest NA: the only transcode path Chrome exposes natively is `<video>→canvas→MediaRecorder`, which is video-only and silently drops audio, so it cannot satisfy the required Opus audio track. Honest, not under-declared.
- **ffmpeg.wasm@0.12.15** — honest NA: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path. Plausible — single-thread wasm Opus encode is slow/fragile.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `transcode` at all. Correct — media-parser is a demux/parse library with no encoder.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `transcode`. Correct — mp4box is an MP4 box parser/segmenter, not a codec/transcoder.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `transcode`. Correct — it is a demuxer only.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/resource.ts:42-57` (`convertPeakMemory = perfCase({ id:'performance/convert-peak-memory', op:'transcode', input: BIG_READ_GOLDEN, options: CONVERT_320x180, oracles:['ssim-psnr','playback-smoke'], primary:'peakMemory' })`).
- **Fixture exists & is real:** `BIG_READ_GOLDEN = 'h264_1080p_30s.mp4'` (`src/scenarios/performance/_shared.ts:71`); `fixtures/media/h264_1080p_30s.mp4` is present at **31 MB** — a genuine 1080p H.264/AAC clip with baked golden meta/packets/ssim (`fixtures/golden/h264_1080p_30s.mp4.{meta,packets,ssim,frames}.json` all present). Not synthetic/empty/mock.
- **Winner adapter is a real implementation:** `src/engines/mediabunny/adapter.ts:848-855` calls `mb.Conversion.init(opts)` then `conversion.execute()` and returns the muxed `BufferTarget` bytes (`adapter.ts:856-868`). No canned output, no input→output copy (a copy is impossible here — container, both codecs, and resolution all change), no short-circuit to the golden file, no error swallowing (invalid conversions throw, `adapter.ts:849-854`).
- **Oracle is a real comparison:** `ssim-psnr` (`src/core/oracles.ts:1688-1810`) decodes the engine's WebM output with the platform decoder, pairs 12 frames, and computes downsampled-luma-signature SSIM against the golden/reference signatures, gating on `ssimMin ≥ 0.97`. The PSNR-∞ shortcut requires digest-identical frames (`oracles.ts:1803`), which is unreachable for a cross-codec downscale, so the gate rests on real SSIM. Measurements are physically plausible: 12 pairs, SSIM ~0.9997 for a high-quality VP9 downscale, exactFrames=0.
- **Gate strength caveat:** This is a perceptual-proxy gate (SSIM signatures, `exactFrames=0`, no true RGB PSNR) rather than a bit-exact/structural gate. It is the correct oracle class for a lossy cross-codec downscale, but it is intrinsically looser than a golden-packets or decoded-frames-bitexact gate.
- **Cached note:** the winner's result has `cached==true` ("cached previous PASS result"); both PASS rows are reused, not re-run this invocation. Staleness risk applies to the exact wall/fps numbers, though the 1.94× margin is large enough to survive normal run-to-run variance.
- **Verdict:** **WEAK-GATE** — real fixture + real library implementation + meaningful (but perceptual-proxy, exactFrames=0) oracle. The PASS is genuine; the correctness gate is the legitimately-loose SSIM proxy appropriate for a lossy downscale, not a strict bit-exact gate, and the *declared* primary metric (peakMemory) produced no sample so the ranking rests on secondary perf metrics.

## Confidence & caveats

- **Confidence: medium.** Both PASS results are `cached==true` (stale-number risk) and every bench metric is single-sample (`n==1`, `mad==0`), so spread is unknown. However the decisive 1.94× wall/fps margin is corroborated across two independent metrics and is far larger than typical single-run noise.
- The declared `primaryMetric` (peakMemory) is unmeasured in this non-COI run for BOTH engines — the winner is decided on secondary metrics, not on the dimension the scenario nominally ranks. A re-run under cross-origin isolation could surface a peakMemory winner that differs from the wall/fps winner.
- exactFrames=0 means no bit-exact corroboration; correctness rests entirely on the SSIM proxy (≥0.97 floor, both at 0.9997). The two engines' SSIM values differ only at the 4th decimal — correctness is a true tie.
- The 5 NA engines are all honestly NA (3 do not declare transcode; platform drops audio; ffmpeg.wasm Opus-encode is unreliable) — no under-declared capability detected.
