# transcode/roundtrip_leg1_h264_to_vp9

family: transcode · fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AVC video + AAC audio in MP4, ~31 MB, 30 s) · primaryMetric: throughputRealtime · passCount: 2 / 7

Operation: cross-codec transcode H.264-in-MP4 → VP9-in-WebM with AAC → Opus audio (leg 1 of the A.16 double-transcode round-trip). Tolerances `ssimMin 0.97`, `psnrMinDb 36`. No committed golden, so the `ssim-psnr` oracle validates the candidate VP9 output against an in-browser reference decode of the original H.264 source (§5.2 reference-source path).

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — two engines passed (mediabunny and remotion-webcodecs@4.0.479), both clearing the SSIM gate with effectively perfect scores. Correctness is a statistical tie, so the decision falls to **performance**, where mediabunny wins decisively.

Decisive factor: main-thread responsiveness and wall throughput. mediabunny finishes in **4323 ms vs 7044 ms (1.63x faster wall)**, runs at **6.94x realtime vs 4.26x (1.63x higher throughput)**, encodes at **208 fps vs 128 fps (1.63x higher encodeFps)**, and — most importantly — blocks the main thread for only **474 ms of long-tasks vs 13168 ms (27.8x less)**. Margin over runner-up: ~1.63x on every throughput axis and ~28x on UI jank. Caveat: both benches are n==1 (no spread), so the magnitude is single-sample evidence, but the longtasks gap is far too large to be noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ playback-smoke:✓ | 4323.18 ms | 6.939x | 0 (not sampled) | 474 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:✓ playback-smoke:✓ | 7043.69 ms | 4.259x | 0 (not sampled) | 13168 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA — MediaRecorder canvas-capture path is video-only, drops audio; cannot produce requested Opus track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in vendored wasm core traps / exceeds suite timeout; Opus encode not a reliable path |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory has n==0 samples for both winners — the metric was not captured this run, so it carries no weight in ranking.)

## Why the winner wins (deep technical)

This row is a full lossy re-encode: every H.264 frame must be hardware-decoded, the raw VideoFrames re-encoded as VP9, and the AAC audio re-encoded to Opus, all re-muxed into WebM. Both PASS engines drive native WebCodecs (`env.configUsed.backend == "webcodecs"` for both) on the same Apple M1 Max / ANGLE-Metal host, so the codec quality is identical in the limit — and the oracle confirms it: mediabunny lands `ssimMin 0.99999672 / ssimMean 0.99999870`, remotion lands `ssimMin 0.99999965 / ssimMean ≈1.0`, both over `pairs: 12` frames, both with `exactFrames: 0` (no bit-exact frames, exactly as expected for an inter-codec lossy transcode — VP9 will never reproduce H.264's exact pixels). Neither crosses any correctness ladder rung the other misses, so correctness is a tie and performance decides.

mediabunny's edge is architectural. It runs the high-level Conversion API in a `streaming-lockstep` pipeline (`env.configUsed.pipeline == "streaming-lockstep"`, `canvasPoolSize: 4`) — `src/engines/mediabunny/adapter.ts:842` `runConversion()` calls `mb.Conversion.init` then `conversion.execute()`, which fuses read→decode→encode→mux into one back-pressured graph that keeps decode and encode in lockstep rather than buffering whole stages. Before committing the encode it feature-detects the VP9 path with a real `mb.canEncodeVideo(codec, {width,height,bitrate,hardwareAcceleration})` probe walking `[prefer-hardware, no-preference, prefer-software]` (`src/engines/mediabunny/adapter.ts:622-645`), so it selects the fastest viable VP9 encoder up front and avoids a mid-conversion ERROR. The configured hardware-preferred encode (`hwAccel: "prefer-hardware"`) plus the `canvasPoolSize: 4` ring buffer (constant-VRAM frame extraction) is what produces the 208 fps encode rate and, critically, the 474 ms long-task total: work is sliced into small lockstep chunks instead of monolithic main-thread bursts.

remotion-webcodecs is also a genuine WebCodecs transcode — `src/engines/remotion-webcodecs/adapter.ts:521` `transcode()` maps the codecs and calls `convert()` at line 580, which invokes `wc.convertMedia({container, videoCodec, audioCodec, ..., writer: bufferWriter})` at line 615 with `hwAccel: "prefer-hardware(+software fallback)"` and a `streaming-backpressure` pipeline. It is correct (SSIM ≈ 1.0) but slower: its `convert` runs on the main thread (`worker: "convert=main-thread"` in `env.configUsed`) with an `offscreencanvas-2d` pixel backend, which is why it accumulates 13168 ms of long-tasks — the convert loop monopolizes the main thread, and its encode rate is 128 fps vs mediabunny's 208. The net result is the 1.63x wall gap and the 27.8x long-task gap.

For THIS codec/container pair the deciding mechanic is therefore: identical VP9/Opus output fidelity, but mediabunny's fused lockstep Conversion + canvas pool + up-front hardware-encoder probe keep the encode hot and the main thread free, whereas remotion's main-thread `convertMedia` loop stalls the UI ~28x longer for the same H.264→VP9 work.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, lost on perf): correct output (`ssimMin 0.99999965`, 12 pairs) but 1.63x slower wall (7044 vs 4323 ms), 1.63x lower throughput (4.26x vs 6.94x), 1.63x lower encodeFps (128 vs 208), and 27.8x more main-thread long-tasks (13168 vs 474 ms) — its `convert=main-thread` offscreen-2d path is the cost.
- **platform@chrome-149** (NA_ENGINE): honest NA. Its only transcode encoder is `<video>→canvas→MediaRecorder`, which is video-only and silently drops audio; the scenario requires an Opus audio track (`toAudio: opus`), so it cannot satisfy the request. Not an under-declaration.
- **ffmpeg.wasm@0.12.15** (NA_ENGINE): honest NA. The vendored single-thread wasm core's libopus encoder traps or exceeds the suite timeout, so Opus encode is deliberately not declared as a reliable transcode path. Genuine runtime limitation, not a missing op.
- **mp4box@2.3.0** (NA_ENGINE): honest NA — MP4Box.js is an MP4 (de)muxer/parser with no codec encode capability; it correctly does not declare `transcode`.
- **remotion-media-parser@4.0.479** (NA_ENGINE): honest NA — media-parser is a demuxer/probe, no encoder; correctly does not declare `transcode`.
- **web-demuxer@4.0.0** (NA_ENGINE): honest NA — a WASM demuxer only; correctly does not declare `transcode`.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1392-1404` (`id: 'roundtrip_leg1_h264_to_vp9'`, built via `buildVideoScenario`, `src/scenarios/transcode/index.ts:290`). Real fixture asset `h264_1080p_30s.mp4`; `stat` confirms `fixtures/media/h264_1080p_30s.mp4` exists at ~31 MB (real H.264/AAC MP4, not synthetic/empty). `notes`: "Round-trip leg 1/2 (A.16 double-transcode): H.264→VP9. SSIM gates leg-1 fidelity."
- Winner adapter: `src/engines/mediabunny/adapter.ts:521`→`842` (`runConversion` → real `mb.Conversion.init`/`.execute`), with up-front VP9 encoder feature-detect at `src/engines/mediabunny/adapter.ts:622-645` (`mb.canEncodeVideo`). No canned output, no input→output copy, no golden short-circuit: the bytes come from a `BufferTarget` the Conversion actually wrote (`adapter.ts:856-867`).
- Gating oracle: `ssim-psnr` at `src/core/oracles.ts:1688`; with no committed golden it routes to `ssimVsReferenceSource` (`src/core/oracles.ts:1842`), which decodes the ORIGINAL source in-browser via `decodeWithPlatform` and computes per-frame `ssim()`/`psnrDb()` against the candidate (gate on worst frame, `ssimMin >= 0.97`). This is a real pixel comparison, not trivially satisfiable. `playback-smoke` (`oracles.ts:1572`) is a secondary smoke gate. Measurements are physically plausible: 12 paired frames, SSIM 0.99999–1.0, exactFrames==0 (correct for lossy VP9).
- Caveat on the gate strength: this is a perceptual SSIM proxy with `exactFrames==0` (no bit-exact / golden-packet check), which sits on the "perceptual proxy" rung — strong evidence of fidelity but weaker than a structural/bit-exact gate. SSIM ≈ 1.0000 (worst frame) is a tight pass, well above the 0.97 floor.
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result", startedAt 2026-06-22T13:58Z) and so does remotion-webcodecs (`cached: true`, 2026-06-22T17:02Z). Both winners' numbers were reused, not freshly re-run — staleness risk applies symmetrically to both, so the relative ranking is unaffected, but the absolute timings could be stale per the launcher-seeding caveat.
- Verdict: **WEAK-GATE**. Real fixture + real WebCodecs implementation + a real reference-source SSIM comparison, but the gate is a perceptual SSIM proxy (exactFrames==0, no golden-packet/bit-exact check), so the PASS is genuine but not the strongest possible. Both winners cached.

## Confidence & caveats

- Confidence: high on the winner choice. Correctness is a tie; the performance margin is consistent (~1.63x on three independent throughput metrics) and overwhelming on long-tasks (27.8x), so the ordering is robust even though each bench is n==1 (mad/p95 == median, no spread to assess).
- The decision rests on performance because both engines pass the same oracle at the same fidelity; if a stricter bit-exact/structural gate existed for VP9 output, neither would clear it (lossy re-encode), so the proxy gate is appropriate but limits gate strength.
- Both winner rows are cached — fresh re-run could shift absolute timings (per the launcher stale-PASS caveat) but is unlikely to flip a 1.63x/27.8x gap.
- peakMemory was not sampled (n==0) for either engine, so the memory tiebreaker could not be applied.
