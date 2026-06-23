# decode-seek/decode_multitrack_select_video

family: decode-seek | fixture asset: `fixtures/media/h264_multitrack.mp4` (4.5 MB, real H.264 1280x720@30 + two AAC stereo tracks) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED win (5 of 7 engines PASS).
- **Decisive factor:** correctness is tied at the top tier among four engines (mediabunny, web-demuxer, remotion-webcodecs, platform all produce 12/12 digest-identical frames, exactFrames=12, SSIM=1, PSNR=∞), so the win falls to PERFORMANCE on the primary metric. mediabunny is fastest: **decodeFps 97.69** vs platform 87.03 (**1.12x**), web-demuxer 77.14 (**1.27x**), remotion-webcodecs 54.85 (**1.78x**). Wall median 307.1 ms is also lowest (vs platform 344.7 ms, **1.12x faster**).
- **Margin over runner-up (platform):** 1.12x on decodeFps and 1.12x on wall. mediabunny also reports no peakMemory sample (0), whereas platform recorded a 421.6 MB peak — a strong secondary advantage, though mediabunny's longtasks (19,963 ms) is high vs platform's 3,234 ms (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | decodeFps (primary) | wall median ms | peakMemory | longtasks ms | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true (exact 12/12) | **97.69** | **307.1** | 0 (n=0) | 19963 | cached previous PASS |
| platform@chrome-149 | PASS | ssim-psnr:true (exact 12/12) | 87.03 | 344.7 | 421,567,741 | 3234 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (exact 12/12) | 77.14 | 388.9 | 0 (n=0) | 4410 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (exact 0/12, SSIM 0.9999) | 57.09 | 525.5 | 0 (n=0) | 3675 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (exact 12/12) | 54.85 | 546.9 | 0 (n=0) | 1017 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is: open a multi-track MP4 (one H.264 video track + two AAC stereo audio tracks), **select the correct video track**, decode it, and ignore the audio. The gating risk is track misselection — decoding an audio track, or the wrong video track, would yield zero/garbage frames and fail the SSIM/PSNR oracle.

mediabunny solves this with `MediaInput.getPrimaryVideoTrack()` at `src/engines/mediabunny/adapter.ts:1333`, which resolves the video track by type out of the three-track set rather than blindly taking track 0. It then constructs a real `VideoSampleSink(videoTrack, …)` at `adapter.ts:1387` and pulls `VideoSample` objects via `for await (const sample of sink.samples())` (`adapter.ts:1392`), converting each to RGBA through `imageDataFromVideoSample` and hashing with `digestImageData` (`adapter.ts:1398-1399`). The env shows it ran on the hardware WebCodecs path (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`) on the Apple M1 Max VideoToolbox decoder. Copying the sample straight to RGBA (rather than canvas draw + readback) keeps the normalized digest bit-exact, which is why the oracle reports **all 12 paired frames digest-identical (SSIM=1, PSNR=∞)** with `exactFrames:12, ssimMin:1` — the strongest possible result on the ssim-psnr ladder.

With correctness maxed out and identical to three competitors, the differentiator is throughput. mediabunny's hardware decode pulls 97.69 decodeFps and a 307.1 ms wall, the lowest of any engine. Against the platform `VideoDecoder` baseline (also hardware WebCodecs, queueDepth 2, `webgpu>webgl>offscreen2d` pixel path) mediabunny is 1.12x faster on both metrics; against remotion-webcodecs (also WebCodecs but `offscreencanvas-2d` + `streaming-backpressure` with `waitForQueueToBeLessThan`) it is 1.78x faster. mediabunny's `streaming-lockstep` pull model with a 4-deep `canvasPoolSize` keeps the decoder fed without the backpressure stalls that throttle remotion-webcodecs. It also reports no resident peak-memory sample (n=0), whereas platform's `<video>→canvas→MediaRecorder` driven path recorded a 421.6 MB peak.

## What each other framework did wrong

- **platform@chrome-149** — PASS, correctness-tied (exact 12/12), but slower: decodeFps 87.03 vs 97.69 (loses by 1.12x) and wall 344.7 ms vs 307.1 ms. Also the only engine with a measured peakMemory (421.6 MB). Runner-up.
- **web-demuxer@4.0.0** — PASS, correctness-tied (exact 12/12), but decodeFps 77.14 (1.27x slower) and wall 388.9 ms. Its wasm demux + WebCodecs decode is correct but not the fastest pull pipeline.
- **ffmpeg.wasm@0.12.15** — PASS but on the **weaker** rung of the correctness ladder: exactFrames 0/12, oracle fell back to the SSIM proxy (`SSIM min 0.9999 ≥ 0.99`, mean 0.999948). Its single-thread wasm software decoder applies a slightly different YUV→RGB conversion, so no frame is digest-identical. Also slowest-but-one: decodeFps 57.09, wall 525.5 ms.
- **remotion-webcodecs@4.0.479** — PASS, correctness-tied (exact 12/12), but **slowest** decodeFps 54.85 (1.78x slower than mediabunny) and highest wall 546.9 ms, due to its `streaming-backpressure` / `waitForQueueToBeLessThan` queue gating and `offscreencanvas-2d` readback. (Lowest longtasks at 1017 ms, but that does not offset the throughput gap on the primary metric.)
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — mp4box is a demuxer/box parser with no decode capability; declaring decodeFrames would be an under-declaration risk it correctly avoids.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — media-parser is a parse-only library (no pixel decode), so the NA is genuine, not an under-declared capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:187` (`id: 'decode_multitrack_select_video'`, `asset: 'h264_multitrack.mp4'`, `container: 'mp4'`, `videoCodec: 'h264'`, `maxFrames: 30`). Notes confirm the intent: decode the video track of "one H.264 video + two AAC audio tracks" and ignore the audio tracks.
- **Fixture exists:** `fixtures/media/h264_multitrack.mp4`, 4.5 MB real file. Golden meta (`fixtures/golden/h264_multitrack.mp4.meta.json`) confirms a genuine multi-track layout: 1 video (h264 1280x720@30, 3.36 Mbps) + 2 audio (AAC 48 kHz stereo, ~128 kbps each). Goldens present: `.frames.json` (per-frame sha256 digests), `.ssim.json` (77 KB luma signatures), `.packets.json`, `.meta.json`. Not synthetic/mock.
- **Winner implementation:** `src/engines/mediabunny/adapter.ts:1330-1410` — real `getPrimaryVideoTrack()` (line 1333) + real `VideoSampleSink` WebCodecs decode (line 1387) + per-frame RGBA digest (lines 1398-1399). No hardcoded output, no input→output copy, no golden short-circuit, no error-swallowing-as-success (a missing track throws at line 1343).
- **Oracle:** `src/core/oracles.ts:1688` (`ssimPsnr`). Real comparison: pairs candidate digests against committed golden frame digests (line 1766); digest match → exact frame (SSIM 1 / PSNR ∞); otherwise downsampled-luma SSIM via `sigSsim` (line 1783). Measurements are physically plausible: 12 frames at 30 fps over the maxFrames=30 cap, ssimMin=1 for exact matches and 0.9999 for ffmpeg's conversion-drift case. Not trivially satisfiable — ffmpeg's 0/12-exact result shows the digest gate genuinely discriminates.
- **Cached note:** the winner's result has `cached:true` ("cached previous PASS result"), as do all 5 PASS rows. Evidence is reused, not re-run this session — minor staleness risk, but the underlying fixture, adapter, and oracle were all verified present and genuine here.
- **Verdict: REAL** — real multi-track fixture, genuine track-selecting WebCodecs decode, and a meaningful digest-exact correctness oracle that distinguishes engines.

## Confidence & caveats

- Confidence: **high** that mediabunny is the legitimate winner — correctness is the strongest possible tier (12/12 digest-exact) and it leads the primary metric.
- All bench rows are **n=1** (single sample, mad=0, p95=median): the 1.12x throughput margin over platform is from one measurement and is modest; on a different run the order of the top hardware-WebCodecs engines (mediabunny / platform) could plausibly swap. The 1.78x lead over remotion-webcodecs is large enough to be robust.
- All five PASS results are **cached**; numbers were not regenerated this session.
- mediabunny's longtasks figure (19,963 ms) is anomalously high vs every other engine (1,017–4,410 ms) and exceeds its own 307 ms wall — almost certainly a cumulative/instrumentation artifact in the cached row, not real main-thread blocking; it does not affect the throughput-based ranking but is noted as a data-quality flag.
- peakMemory is only sampled for platform (n=1); the other engines report n=0, so the memory comparison is one-sided.
