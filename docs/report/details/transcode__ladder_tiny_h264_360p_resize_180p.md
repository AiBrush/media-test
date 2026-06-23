# transcode/ladder_tiny_h264_360p_resize_180p

family: transcode | fixture asset: `tiny_h264_360p_2s.mp4` (H.264 640x360 @30fps + AAC 48kHz stereo, ~2s, 173 KB) | primaryMetric: framesPerSec | passCount: 3 / 7

Operation: transcode + resize H.264/MP4 640x360 -> H.264/MP4 320x180 (fit:fill), AAC carried through. Gate: `ssim-psnr` with ssimMin 0.95, psnrMinDb 22.

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — 3 engines PASS (mediabunny, remotion-webcodecs, ffmpeg-wasm).

Decisive factor: mediabunny wins on BOTH axes. Correctness: highest SSIM of the field (min 0.9997 / mean 0.9998 vs remotion-webcodecs 0.9997/0.9997 and ffmpeg-wasm 0.9698/0.9703 — ffmpeg-wasm sits only 0.02 above the 0.95 floor). Performance: fastest of the field at 315.1 fps / 190.4 ms wall.

Margin over runner-up (remotion-webcodecs): **1.13x faster fps** (315.1 vs 279.5), **1.13x lower wall** (190.4 vs 214.7 ms). Over ffmpeg-wasm: **1.90x faster fps** (315.1 vs 166.1), **1.90x lower wall** (190.4 vs 361.2 ms). All three SSIM-comparable above floor, but mediabunny + remotion-webcodecs are near-perfect (~0.9997) while ffmpeg-wasm is a markedly weaker reconstruction. Caveat: n==1 for every metric (single timed sample, mad==0), so the perf gap over remotion-webcodecs is suggestive, not statistically firm; the 1.9x gap over ffmpeg-wasm is large enough to be robust to n==1 noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (min 0.9997 / mean 0.9998, 12 pairs, 0 exact) | 190.42 | n/a (fps 315.09) | 0 (not sampled) | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (min 0.9997 / mean 0.9997, 12 pairs, 0 exact) | 214.68 | n/a (fps 279.49) | 0 (not sampled) | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (min 0.9698 / mean 0.9703, 12 pairs, 0 exact) | 361.21 | n/a (fps 166.11) | 0 (not sampled) | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: throughputRealtime and peakMemory were not benched for this scenario (peakMemory has n==0, empty samples); the metric set is framesPerSec/wall/encodeFps/peakMemory and primaryMetric is framesPerSec. longtasks not measured.

## Why the winner wins (deep technical)

This is the "tiny" rung of the size ladder: a ~173 KB, 2-second H.264/MP4 clip re-encoded at half resolution. The scenario notes call it "init-overhead-dominated end of the curve" — wall time is governed almost entirely by encoder/decoder bring-up and muxer/demuxer setup, not steady-state throughput. That framing is what makes mediabunny win.

Codec/container mechanics: source is H.264 in plain MP4 (faststart isom) with an AAC stereo track. The target is the same family (H.264/MP4) at 320x180, so the heavy lifting is decode H.264 -> resize to 320x180 -> re-encode H.264 -> remux MP4, with AAC carried through. mediabunny runs this through its real `Conversion` API (`mb.Conversion.init` / `.execute`, `src/engines/mediabunny/adapter.ts:842-861`), which fuses read->decode->encode->mux into a single streaming-lockstep pipeline (configUsed `pipeline: "streaming-lockstep"`, `queueDepth: "auto"`). Both the decode and encode legs run on hardware WebCodecs: configUsed `backend: "webcodecs"`, `hwAccel: "prefer-hardware"` on an Apple M1 Max (ANGLE Metal). The resize is handed to the Conversion video block as `width/height` with `fit: 'fill'` (`adapter.ts:556-586`), so scaling happens inside the WebCodecs/GPU path rather than via a JS pixel loop. Critically, the encoder acceleration mode is chosen by probing `mb.canEncodeVideo(...isConfigSupported)` in preference order `[prefer-hardware, no-preference, prefer-software]` for H.264 (`adapter.ts:622-645`), so it commits to the M1's hardware H.264 encoder before muxing — never handing the Conversion a config the browser would reject mid-stream.

Oracle evidence: the gate `ssim-psnr` (`src/core/oracles.ts:1688`) re-decodes each engine's MP4 output with the platform decoder, samples 12 frames, downsamples luma, and compares against the committed golden luma signatures in `fixtures/golden/tiny_h264_360p_2s.mp4.ssim.json` (`oracles.ts:1782-1786`). It gates on the WORST frame (`minSsim >= t.ssimMin`, `oracles.ts:1823`). mediabunny's worst frame is 0.9997 and mean 0.9998 over 12 pairs — essentially a perfect perceptual reconstruction of the resized golden, the highest in the field. `exactFrames` is 0 for all three (expected: re-encode produces a different bitstream, so the SHA-256 digest-equality fast path at `oracles.ts:1766` never fires, and PSNR via golden pixels is reported as unavailable — `psnrDb` is not measured). So the gate rests on SSIM, where mediabunny is strongest.

Performance mechanics: at this tiny size, mediabunny's edge is fixed-cost amortization. Its core build is `pure-ts-esm` with `sharedArrayBuffer: false` and `coopCoep: "not-required"` (configUsed) — no wasm module to instantiate, no COOP/COEP cross-origin-isolation precondition, no worker thread to spin up. The Conversion streams through WebCodecs with a 4-slot canvas pool (`canvasPoolSize: 4`) keeping VRAM constant. Result: 190.4 ms wall, 315.1 fps. remotion-webcodecs is the same WebCodecs-on-M1 class and matches the SSIM (0.9997), but its pipeline carries extra machinery — `pipeline: "streaming-backpressure"`, `writer: "bufferWriter"`, `waitForQueueToBeLessThan` backpressure gating, `convert=main-thread` — which adds setup/coordination overhead that shows up as the 1.13x wall penalty (214.7 ms) on this init-dominated workload. ffmpeg-wasm is the outlier: it is a single-thread wasm transcoder (no hardware encode), so it pays wasm instantiation + software H.264 encode, landing at 361.2 ms / 166.1 fps (1.9x slower) AND a much weaker reconstruction (SSIM 0.9698) because its software x264-style encode at a low default bitrate for 320x180 produces visibly more deviation from the golden than the hardware encoders do.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, lost on performance. SSIM is tied at the top (min 0.9997), but it is 1.13x slower (214.68 ms vs 190.42 ms wall; 279.49 vs 315.09 fps). Its `streaming-backpressure` + `bufferWriter` + main-thread convert pipeline (configUsed) adds setup/coordination cost that dominates this 2s/init-bound clip. No correctness deficit — purely the runner-up margin.
- **ffmpeg.wasm@0.12.15** — PASS, lost on BOTH axes. Weakest correctness (SSIM min 0.9698 / mean 0.9703, only 0.02 above the 0.95 floor) from software H.264 re-encode, and slowest (361.21 ms wall, 166.11 fps — 1.90x slower than the winner) because it is single-thread wasm with no hardware encode.
- **platform@chrome-149** — NA_ENGINE (honest). The source has an AAC track; platform's transcode encode path is `<video> -> canvas -> MediaRecorder` (configUsed `encode`), and canvas-capture cannot carry/copy the source audio, so it correctly declines rather than silently dropping audio. Legitimate runtime limitation of the MediaRecorder path, not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). A demux-only library; does not declare operation 'transcode' (no encoder/muxer). Correct NA.
- **mp4box@2.3.0** — NA_ENGINE (honest). An ISOBMFF box parser/remuxer with no encoder; does not declare 'transcode'. Correct NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). A parser, not an encoder; does not declare 'transcode'. Correct NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1138` (case `ladder_tiny_h264_360p_resize_180p`), materialized via `defineScenario` at `index.ts:1194-1218` (op `transcode`, oracle `ssim-psnr`, tolerances ssimMin 0.95 / psnrMinDb 22, primaryMetric framesPerSec).
- Fixture: `asset: 'tiny_h264_360p_2s.mp4'` resolves to `fixtures/media/tiny_h264_360p_2s.mp4`, which EXISTS (173 KB real H.264/AAC MP4; `fixtures/golden/tiny_h264_360p_2s.mp4.meta.json` confirms H.264 640x360@30 + AAC 48k stereo, 2s). Not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts` — genuine implementation. Build video conv opts incl. resize at `adapter.ts:546-614`, hardware-encode probe via `mb.canEncodeVideo`/isConfigSupported at `adapter.ts:622-645`, and the real `mb.Conversion.init(opts)` / `.execute()` run-to-bytes at `adapter.ts:842-861`. It calls the real mediabunny Conversion + WebCodecs encoder; it does NOT copy input->output, return canned bytes, short-circuit to the golden, or swallow errors (it throws a clear NA(browser) when no encoder mode is supported, `adapter.ts:647-654`).
- Oracle: `ssim-psnr` at `src/core/oracles.ts:1688` performs a REAL comparison: re-decodes the engine's output bytes via the platform decoder, downsamples luma per frame, and compares against committed golden luma sigs (`oracles.ts:1782-1786`), gating on the worst-frame SSIM >= 0.95 (`oracles.ts:1823`). Measurements (12 pairs, ssimMin 0.9997, exactFrames 0) are physically plausible for a hardware H.264 re-encode of a 2s clip resized to 320x180.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the SSIM comparison is a genuine pixel-derived check against a committed golden, BUT it is a perceptual luma-signature proxy (not bit-exact), `psnrDb` is not measured, and `exactFrames==0` so the strong digest/PSNR path never engages. The PASS is real; the gate strength is proxy-level, and ffmpeg-wasm passing at 0.9698 (just above the 0.95 floor) shows the tolerance is not tight. The mediabunny/remotion ~0.9997 results are strong evidence of near-perfect reconstruction even under this loose gate.
- Cached note: ALL three PASS engines have `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run, so there is staleness risk per the launcher seeding caveat — numbers reflect a prior run, not this invocation.

## Confidence & caveats

Confidence: medium-high. The winner's correctness lead (0.9998 vs 0.9703 over ffmpeg-wasm) and 1.9x perf lead over ffmpeg-wasm are unambiguous. The lead over remotion-webcodecs is real on both wall and fps but modest (1.13x) and rests on n==1 timing samples (mad==0, single sample) plus cached results, so it is suggestive rather than firm. The gate is a perceptual proxy (WEAK-GATE), so "best" here means best perceptual reconstruction + fastest, not bit-exact superiority. peakMemory/throughputRealtime/longtasks were not measured, so no memory/jank tiebreaker was available.
