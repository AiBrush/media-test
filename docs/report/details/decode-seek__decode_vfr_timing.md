# decode-seek/decode_vfr_timing

family: decode-seek | fixture asset: `fixtures/media/h264_vfr.mp4` (2.3 MB, H.264 1280x720 + AAC, container mp4, durationSec 12.533) | golden: `fixtures/golden/h264_vfr.mp4.frames.json` (12 frame digests) + `.ssim.json` (luma sigs) | primaryMetric: decodeFps | passCount: 5 of 7

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — 5 engines PASS (mediabunny, remotion-webcodecs, web-demuxer, ffmpeg.wasm, platform); 2 are NA_ENGINE (remotion-media-parser, mp4box, which do not declare `decodeFrames`).

Decisive factor: correctness-strength tie at the top (mediabunny, remotion-webcodecs, web-demuxer and platform are ALL digest-bit-exact: 12/12 exactFrames, SSIM=1, PSNR=inf), so the ranking falls through to PERFORMANCE on the primaryMetric `decodeFps`. mediabunny wins decode throughput at **105.42 fps**, ahead of web-demuxer (92.31), platform (87.46) and remotion-webcodecs (72.53). ffmpeg.wasm also passes but is correctness-WEAKER (0/12 exactFrames; SSIM-proxy only) and is excluded from the top tier.

Margin over runner-up (web-demuxer, the next bit-exact engine): **1.14x faster decodeFps** (105.42 / 92.31), **1.14x lower wall** (650.0 / 569.2 ms = 1.14x), and **1.72x fewer longtask-ms** (403 / 234). Over the strongest bit-exact WebCodecs peer platform: 1.21x decodeFps, 1.21x wall (686.0/569.2), 5.1x fewer longtask-ms (1192/234). All bench n==1 — the margin is single-sample evidence (see caveats).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 569.17 | 105.42 | 0 (not measured) | 234 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 650.00 | 92.31 | 0 (not measured) | 403 | cached previous PASS |
| platform@chrome-149 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 686.01 | 87.46 | 676,672,614 | 1192 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (0/12 exact, SSIM min 0.9963 / mean 0.9992) | 758.88 | 79.06 | 1,364,575,631 | 889 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (12/12 exact, SSIM=1) | 827.19 | 72.53 | 0 (not measured) | 9925 | cached previous PASS |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation under test is `decodeFrames` on a **variable-frame-rate H.264-in-MP4** clip. The VFR twist (scenario notes, `src/scenarios/decode-seek/index.ts:83`) is that "each frame digest is keyed by its true (uneven) pts; golden encodes the same pts." Concretely, the gate (`ssim-psnr`, `src/core/oracles.ts:1689`) pairs the engine's own decoded frames (`ctx.frames`) against the 12 committed golden frame digests by index, and a pair counts as exact only when the candidate's normalized-RGBA sha256 equals the golden's (`oracles.ts:1766`). An engine that mis-orders B-frames, drops a sample, or stamps the wrong presentation timestamp on a VFR clip would shift the index-to-content alignment and break digest equality. mediabunny scored `exactFrames:12, ssimMean:1, ssimMin:1` — every one of the 12 paired frames is byte-identical to golden, so its VFR pts handling and decode-order-to-presentation-order reorder are provably correct.

Mechanistically, mediabunny's adapter (`src/engines/mediabunny/adapter.ts:1330` `decodeFrames`) takes the hardware WebCodecs path: it builds a `VideoSampleSink` over the primary video track (`adapter.ts:1387`) and iterates `sink.samples()` in presentation order (`adapter.ts:1392`), reading each frame's true microsecond pts directly from `sample.microsecondTimestamp` (`adapter.ts:1399`). Crucially it copies pixels via `VideoSample.copyTo(RGBA)` rather than canvas readback (`env.configUsed.pixelBackend = "VideoSample.copyTo(RGBA)>canvas"`; comment `adapter.ts:1385-1386`), which avoids canvas-fingerprinting perturbation and yields the exact RGBA bytes the golden was baked from — that is why mediabunny gets digest-exact rather than merely SSIM-close. The decode ran on `configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `wasmThreads:0`, `coopCoep:"not-required"` on the Apple M1 Max VideoToolbox decoder, with a streaming-lockstep pipeline. Hardware decode plus zero-copy RGBA extraction is what produced the chart-topping **105.42 decodeFps / 569.17 ms wall / 234 ms longtasks** — beating the other three bit-exact engines on every performance axis while carrying the same maximal correctness.

Against the runner-up web-demuxer (also 12/12 exact), mediabunny is 1.14x faster on decodeFps and produces 1.72x fewer longtask-ms; web-demuxer demuxes with its wasm core then hands packets to WebCodecs, adding demux overhead mediabunny avoids with its native sample sink. Against platform (Chrome's own VideoDecoder, also 12/12 exact), mediabunny is 1.21x faster and shows 5.1x fewer longtask-ms (234 vs 1192) and platform additionally reports 676 MB peakMemory (its webgpu>webgl>offscreen2d pixel pipeline), whereas mediabunny's copyTo path didn't even register a peakMemory sample.

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS, equally bit-exact (12/12, SSIM=1), but lost on performance: 92.31 decodeFps vs 105.42 (0.88x), 650.0 ms wall vs 569.17 (1.14x slower), 403 vs 234 longtask-ms. Closest competitor; demux-then-WebCodecs adds overhead the native sample sink avoids.
- **platform@chrome-149** — PASS, bit-exact (12/12, SSIM=1), but slower (87.46 fps, 686.01 ms, 1.21x slower) and far heavier on main-thread blocking (1192 ms longtasks, 5.1x mediabunny's) plus 676 MB peakMemory.
- **ffmpeg.wasm@0.12.15** — PASS but correctness-WEAKER and disqualified from the top tier: `exactFrames:0/12`, gate satisfied only via the SSIM proxy (min 0.9963 >= 0.99, mean 0.9992). Its software libavcodec decode + scaler produces pixels that are perceptually but not byte-identical to the WebCodecs-baked golden, so no frame is digest-exact. Also slowest-but-one (79.06 fps) and heaviest memory (1.36 GB peakMemory).
- **remotion-webcodecs@4.0.479** — PASS, bit-exact (12/12, SSIM=1), but slowest decode (72.53 fps, 827.19 ms) and dramatically worse main-thread behavior: **9925 ms longtasks** (42x mediabunny's 234) from its streaming-backpressure pipeline with on-main-thread conversion.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — remotion's media-parser is a demux/metadata parser, not a decoder; it has no WebCodecs decode op to expose, so the capability is genuinely absent, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — mp4box.js is an MP4 box demuxer/segmenter; it parses samples but does not decode pixels, so it cannot emit frame digests for this gate.

## Anti-cheat validation

- Scenario: `src/scenarios/decode-seek/index.ts:76-84` defines `id: 'decode_vfr_timing'`, `asset: 'h264_vfr.mp4'`, `container:'mp4'`, `videoCodec:'h264'`, `maxFrames:60`, with the VFR rationale in `notes` (line 83).
- Fixture exists and is REAL: `fixtures/media/h264_vfr.mp4` = 2.3 MB; golden meta confirms H.264 1280x720 @ 8.856 fps + AAC, durationSec 12.533. Not synthetic/empty/mock.
- Golden is real: `fixtures/golden/h264_vfr.mp4.frames.json` carries 12 frame digests with explicit per-frame `ptsUs` (0, 33333, 66667, 100000, ...), and `.ssim.json` carries luma sigs. The gate compares against these.
- Winner adapter genuinely implements decode: `src/engines/mediabunny/adapter.ts:1330` builds a real `VideoSampleSink` (`adapter.ts:1387`), iterates real decoded `VideoSample`s (`adapter.ts:1392`), reads true pts from `sample.microsecondTimestamp` (`adapter.ts:1399`), and hashes normalized RGBA via `digestImageData` (`adapter.ts:1399`, `src/engines/mediabunny/digest.ts:42` uses real `crypto.subtle.digest('SHA-256')`). No canned output, no copy-input-to-output, no short-circuit to golden, no error-swallow-to-success.
- Oracle is meaningful: `ssim-psnr` (`src/core/oracles.ts:1689`) does a genuine per-frame comparison — sha256 digest equality first (`oracles.ts:1766`), falling back to downsampled-luma SSIM with a 0.99 floor gated on the WORST frame (`oracles.ts:1823`). Measurements are physically plausible: 12 pairs (matches golden frame count), SSIM in [0.9963,1], the ffmpeg case correctly distinguished as 0/12 exact. Not trivially satisfiable.
- Cached note: ALL 7 results have `cached:true` ("cached previous PASS result"). The evidence is reused, not freshly re-run; per memory note on launcher seeding, stale-PASS reuse is a known caveat. Verdict reflects this as a confidence reducer, not a cheat.

Verdict: **REAL** — real fixture, real WebCodecs decode implementation, meaningful digest+SSIM oracle with plausible measurements.

## Confidence & caveats

- Confidence: medium. The winner is unambiguous on the decision procedure (top correctness tier + fastest primaryMetric), but two caveats temper it: (1) every bench metric is n==1 (mad=0, p95==median) so the ~1.14x margin over web-demuxer is single-sample evidence and could be within run-to-run noise; (2) all 7 entries are `cached:true`, so numbers were not re-measured this run (staleness risk).
- mediabunny and platform do not report peakMemory (n=0 sample), so the peak-memory tiebreaker is unavailable for the winner; ranking rests on decodeFps/wall/longtasks.
- ffmpeg.wasm's PASS is real but rests on the SSIM proxy (0 exact frames) — correct decision to rank it below the bit-exact engines.
