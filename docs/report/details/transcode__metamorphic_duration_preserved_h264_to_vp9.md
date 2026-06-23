# transcode/metamorphic_duration_preserved_h264_to_vp9

family: transcode | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB) | primaryMetric: wall (TC_METRICS) | passCount: 2 of 7

This is a metamorphic, cross-codec re-encode: `probe(transcode(x)).dur ≈ probe(x).dur`. Source is H.264/AAC in MP4; requested output is VP9 video + Opus audio in WebM (`opts: { container:'webm', video:{codec:'vp9'}, audio:{codec:'opus'}, invariant:'probe-duration' }`, src/scenarios/transcode/index.ts:1346-1360). The single gating oracle is `property-invariant` (probe-duration), which catches an engine that drops/duplicates frames or mis-writes the container duration.

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — exactly two engines PASS (mediabunny and remotion-webcodecs), and both satisfy the identical single oracle (property-invariant / probe-duration) within tolerance, so correctness strength is comparable. Decisive factor: **performance**. mediabunny is ~**1.23x faster wall** (5568.24 ms vs 6840.43 ms), ~**1.23x higher realtime throughput** (5.39x vs 4.39x), ~**1.23x higher encodeFps** (161.6 vs 131.6 fps), and spends **less time in long tasks** (3675 ms vs 4223 ms, 0.87x) — better main-thread responsiveness. Margin caveat: both samples are n==1 and cached, so this is a single-shot, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 5568.24 | 5.388 | 0 (not measured) | 3675 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 6840.43 | 4.386 | 0 (not measured) | 4223 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode NA: libopus encode in vendored wasm core traps/exceeds timeout; Opus encode not a declared reliable path |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only, drops audio; cannot produce the requested audio track |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a full cross-codec transcode: demux MP4 → decode H.264 (AAC) → re-encode to VP9 (Opus) → mux WebM. Both PASS engines run the WebCodecs path (`env.configUsed.backend == "webcodecs"`), so the difference is the conversion pipeline architecture, not the codec engine.

mediabunny drives its high-level Conversion API: `mb.Conversion.init(opts)` then `conversion.execute()` (src/engines/mediabunny/adapter.ts:848,855), invoked from `transcode()` via `runConversion` (adapter.ts:1271-1322). The Conversion runs read→decode→encode→mux as a single **streaming-lockstep** pipeline (`env.configUsed.pipeline == "streaming-lockstep"`, `canvasPoolSize:4`), keeping VRAM constant and avoiding a whole-file buffering stall. Critically, mediabunny's adapter handles the exact failure mode that bites VP9: hardware VP9 encoders are scarce and reject low-bitrate small frames, so the adapter forces a **software-preferred encode for VP9/VP8** (`SOFTWARE_PREFERRED_ENCODE = new Set(['vp9','vp8'])`, adapter.ts:499) and computes a resolution-aware bitrate with a 300 kbps floor (adapter.ts:504-520) instead of the QUALITY_HIGH preset that collapses to a hardware-reject ~120 kbps. At 1080p this never approaches the reject point, so the VP9 encode runs cleanly. The adapter also pins the output duration by setting `convOpts.trim = { start:0, end:inputDuration }` from `durationFromInput` (adapter.ts:1300,1305), which is precisely why the muxed WebM duration tracks the source.

The oracle outcome confirms a correct, duration-preserving transcode of real media: mediabunny `measurements = { outDurationSec:30.02, goldenDurationSec:30, deltaSec:0.0200, durationToleranceSec:0.041667 }` — Δ 0.0200s ≤ 0.0417s tolerance (~1 frame at 24 fps). The 30.02s output vs 30.00s golden is physically plausible: a VP9/Opus re-encode can land a final partial frame / Opus frame slightly past the exact source end, well inside the band. The reference engine probes the authored WebM output and the measured 30.02s is consistent with a genuinely re-encoded 30-second 1080p clip (encodeFps 161.6 fps over 30s × 30fps ≈ 900 frames is consistent with the ~5.6s wall).

mediabunny's measured advantage is uniform across every metric (all ≈1.23x because wall, throughputRealtime and encodeFps are coupled for a fixed-length clip): 5568.24 ms vs 6840.43 ms wall, 5.39x vs 4.39x realtime, 161.6 vs 131.6 encodeFps. Its long-task time is also lower (3675 ms vs 4223 ms, 0.87x), i.e. better main-thread responsiveness despite `worker: convert=main-thread` — the lockstep + canvas-pool design keeps individual tasks shorter. mediabunny additionally requires **no COOP/COEP and no SharedArrayBuffer** (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), a deployment-simplicity tiebreaker, though remotion is likewise wasmThreads:0/webcodecs so that does not separate them here.

remotion-webcodecs is a legitimate, correct runner-up: `transcode()` calls `wc.convertMedia({ container, videoCodec, audioCodec, ... writer: bufferWriter })` (src/engines/remotion-webcodecs/adapter.ts:615-627), a native WebCodecs decode→encode pipeline with backpressure (`pipeline:"streaming-backpressure"`, `queueDepth:"waitForQueueToBeLessThan"`). It actually scores Δ **0.0000s** (outDurationSec:30, goldenDurationSec:30) — marginally more exact than mediabunny's Δ0.0200s. But the oracle is a duration-preservation gate, not a sub-frame fidelity comparison: both are PASS and both are far inside tolerance, so this does not constitute a correctness-strength win for remotion. With correctness comparable, the ranking falls through to performance, where mediabunny leads on every metric.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, lost on performance only. Slower wall 6840.43 ms vs 5568.24 ms (mediabunny 1.23x faster), throughput 4.386x vs 5.388x, encodeFps 131.6 vs 161.6, longtasks 4223 ms vs 3675 ms. Its Δ0.0000s duration is nominally tighter but the oracle does not reward sub-tolerance margin. n==1, cached.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE. Honest capability gap: the requested output needs Opus audio, and libopus encode in the vendored wasm core traps or exceeds the suite timeout, so Opus encode is not declared as a reliable transcode path. Genuine, not under-declared.
- **platform@chrome-149** — NA_ENGINE. Honest gap: its encode path is `<video>→canvas→MediaRecorder`, which is video-only and drops the audio track; it cannot emit the requested Opus audio track. Real architectural limitation of the canvas-capture approach.
- **mp4box@2.3.0** — NA_ENGINE. Does not declare the `transcode` operation. Correct: mp4box is an MP4 box parser/segmenter with no decode/encode codec engine.
- **remotion-media-parser@4.0.479** — NA_ENGINE. Does not declare `transcode`. Correct: it is a demux/parse-only library (no encode).
- **web-demuxer@4.0.0** — NA_ENGINE. Does not declare `transcode`. Correct: demux-only (ffmpeg-wasm-based demuxer, no encode path).

## Anti-cheat validation

- Scenario definition: src/scenarios/transcode/index.ts:1346-1360 (entry in TRANSCODE_PROPERTY_CASES, mapped at index.ts:1363-1382). Declares `asset: 'h264_1080p_30s.mp4'`, real cross-codec output spec (webm/vp9/opus), oracle `['property-invariant']`, invariant `probe-duration`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, ~31 MB — a real 1080p/30s H.264+AAC MP4, not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2709-2759 (probe-duration branch of `propertyInvariant`). It performs a REAL comparison — probes the authored output via `ctx.referenceEngine.probe(...)` (oracles.ts:2719-2728) and compares against the golden/source duration with a resolution/container-aware tolerance band (durationToleranceFor, oracles.ts:2742-2743). Not trivially satisfiable: tolerance is ~0.0417s (~1 frame), and measurements (outDurationSec 30.02/30.00, deltaSec 0.0200/0.0000) are physically plausible for a 30s clip. It fails on Δ > tol (oracles.ts:2745-2752).
- Winner adapter: src/engines/mediabunny/adapter.ts:1271-1322 (`transcode`), runConversion via Conversion.init/.execute at adapter.ts:848,855; VP9 software-preferred encode + bitrate floor at adapter.ts:499,504-520. Genuine library call — no canned output, no input→output copy, no golden short-circuit, no swallowed errors (it throws on unencodable codec / missing tracks).
- Verdict: **REAL**. Real fixture + real WebCodecs/library conversion + meaningful (duration-preservation) oracle. Caveat noted under Confidence.
- Cached note: the winner's result has `cached:true` ("cached previous PASS result"), so the bench numbers (n==1) were reused, not re-run this session — staleness/single-sample risk applies to the performance margin (the PASS verdict itself is reproducible from the code path).

## Confidence & caveats

Confidence: **medium**. The PASS/NA classifications are unambiguous and code-grounded, and the winner's implementation is genuinely real. The reason it is not "high": (1) the gating oracle is a single duration-invariant — it verifies the transcode preserved playable duration but does NOT verify frame fidelity (no SSIM/PSNR or frame-digest gate on this scenario), so it is a moderately weak correctness gate (still REAL, just not bit/perceptual-exact); (2) both PASS engines are `cached:true` with n==1, so the 1.23x performance margin is a single-shot measurement with mad==0/p95==median (no spread evidence) — directionally consistent across all four metrics but not statistically robust; (3) peakMemory was not captured (n==0, value 0), so the memory tiebreaker could not be applied. remotion-webcodecs is a fully valid alternative and is marginally more exact on duration (Δ0 vs Δ0.02); the only thing separating them is throughput.
