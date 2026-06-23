# decode-seek/seek_h264_nonkeyframe

- family: decode-seek | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 1080p, MP4, ~31 MB) | primaryMetric: `seekMs` | passCount: 5 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** — CONTESTED win (5 engines PASS).
- Decisive factor: **performance**. Correctness is a tie at the gating oracle level (all 5 PASS engines satisfy `seek-accuracy` within the 100 ms tolerance, the only oracle on this scenario), so ranking falls to `seekMs`. Mediabunny's seek wall median is **70.44 ms**, beating platform/chrome-149 (the runner-up) at **109.10 ms**.
- Margin over runner-up (platform): **1.55x faster wall** (70.44 ms vs 109.10 ms) and **24.6x fewer longtasks** (179 ms vs 4410 ms of main-thread blocking). Versus the next-best library (web-demuxer 290.09 ms): **4.1x faster**.

## Per-engine results

| engine | status | oracles passed (name:pass) | seekMs/wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 70.44 ms | n/a | n/a | 179 ms | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true | 109.10 ms | n/a | n/a | 4410 ms | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 290.09 ms | n/a | n/a | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true | 459.72 ms | n/a | n/a | 12909 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 5857.69 ms | n/a | n/a | 4223 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

Note: this scenario reports no `throughputRealtime` / `peakMemory` metrics — only `seekMs` (== `wall`) and `longtasks`. All five PASS engines have n=1 (single sample, mad=0), so the spread is unmeasured; the magnitude of the gaps (1.55x up to 83x) makes the ranking robust despite n=1, but individual sub-2x margins carry weaker statistical weight.

## Why the winner wins (deep technical)

The operation is a **non-keyframe seek** into H.264-in-MP4: target `tUs = 7_333_000` (7.333 s), `keyframe: false`, tolerance `seekToleranceUs = 100_000` (src/scenarios/decode-seek/index.ts:454-464). Because the target is not on an IDR, a correct engine must (1) demux the MP4 sample table to find the keyframe at-or-before 7.333 s, (2) feed that GOP into an H.264 decoder, and (3) decode forward to the frame whose presentation time is nearest the target. The `seek-accuracy` oracle (src/core/oracles.ts:2199-2234) is a *timestamp* gate: it computes `expectedPtsUs = nearestPacketPts(golden video packets, 7_333_000)` (src/core/oracles.ts:2250-2268) and passes if `|landedPtsUs − expectedPtsUs| ≤ 100_000`.

Two landing behaviors appear in the shard, both legitimately within tolerance:
- ffmpeg.wasm and platform land at **7_333_000 µs (Δ 333 µs)** — the true nearest frame to 7.333 s.
- mediabunny, web-demuxer, and remotion-webcodecs land at **7_300_000 µs (Δ 33_333 µs)** — exactly one 30 fps frame earlier (the last frame with start ≤ target). Mediabunny's `seek()` documents this explicitly: `VideoSampleSink.getSample` returns "the last frame with start ≤ t (presentation order), i.e. the frame visible at that timestamp" (src/engines/mediabunny/adapter.ts:1413-1414). For a "what is visible at 7.333 s" definition this is the *more* defensible answer; either way the oracle treats both as PASS, so correctness does not separate the field.

Mechanistically, mediabunny wins on speed because its seek path is a tight demux→decode→single-sample pipeline with no whole-file transcode and no wasm boundary. The adapter calls `getPrimaryVideoTrack()`, builds a `VideoSampleSink` with `videoDecoderOptionsForTrack`, then `sink.getSample(targetSec)` (src/engines/mediabunny/adapter.ts:1415-1432). Per `env.configUsed`, mediabunny runs `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`. So the underlying H.264 decode is hardware-accelerated `VideoDecoder` on the Apple M1 Max (ANGLE Metal), and mediabunny only decodes the single GOP from the prior keyframe up to the landed frame — not the whole clip. That yields the 70.44 ms wall and, critically, **179 ms of longtasks** — the seek work is small and well-chunked, keeping the main thread responsive.

By contrast, the runner-up `platform@chrome-149` also uses hardware WebCodecs (`backend: "webcodecs"`, `hwAccel: true`, `decode: "VideoDecoder"`) yet takes 109.10 ms and incurs **4410 ms of longtasks** — 24.6x more main-thread blocking — because the platform reference path drives a `<video>`/canvas-oriented pipeline with `queueDepth: 2` and transferable frame plumbing that is heavier per seek than mediabunny's direct sample sink. Same hardware decoder, leaner orchestration is the difference.

## What each other framework did wrong

- **platform@chrome-149** (PASS, lost on perf): landed at 7_333_000 µs (Δ 333 µs) — equally correct — but 109.10 ms vs 70.44 ms = **1.42x slower** and 4410 ms vs 179 ms longtasks = **24.6x more main-thread blocking**. Same hardware `VideoDecoder`, heavier per-seek orchestration.
- **web-demuxer@4.0.0** (PASS, lost on perf): landed at 7_300_000 µs (Δ 33_333 µs), correct, but 290.09 ms = **4.1x slower** than mediabunny and a very high 19963 ms longtasks (the wasm/ffmpeg demux core is single-thread and main-thread-blocking).
- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): landed at 7_333_000 µs (Δ 333 µs), correct, but 459.72 ms = **6.5x slower**; the wasm decode of the GOP plus 12909 ms longtasks reflect the single-thread wasm cost with no hardware acceleration.
- **remotion-webcodecs@4.0.479** (PASS, lost on perf): landed at 7_300_000 µs (Δ 33_333 µs), correct, but **5857.69 ms = 83.2x slower** than mediabunny — by far the worst. Despite `backend: webcodecs` + hardware fallback, its streaming-backpressure pipeline appears to scan/decode far more of the file before resolving the seek target.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare operation 'seek'". Honest NA — mp4box.js is a demuxer/parser, not a decoder; it can locate samples but does not decode frames, so a seek-to-decoded-frame op is genuinely out of scope.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'seek'". Honest NA — the media-parser is a metadata/packet parser without a decode-to-frame surface; seek-with-landed-frame is correctly not declared (the sibling remotion-webcodecs is the engine that owns decode/seek).

## Anti-cheat validation

- Scenario definition: src/scenarios/decode-seek/index.ts:454-464 (`id: 'seek_h264_nonkeyframe'`). Input asset `h264_1080p_30s.mp4`, container `mp4`, codec `h264`, `tUs: 7_333_000`, `keyframe: false`, `seekToleranceUs: 100_000`. Notes: "Arbitrary (non-keyframe) target 7.333s; lands on the nearest decodable frame within tol." — a real, well-motivated GOP-seek gate.
- Fixture exists: `fixtures/media/h264_1080p_30s.mp4`, ~31 MB on disk (real encoded media, not synthetic/empty).
- Oracle: `seekAccuracy` at src/core/oracles.ts:2199-2234, with expected-pts resolution at src/core/oracles.ts:2250-2268. It performs a real comparison of the engine-reported `landedPtsUs` against the golden's nearest video packet PTS and fails on Δ > 100_000 µs. Not trivially satisfiable: a wrong-GOP landing (e.g., snapping to the prior keyframe at ~7.0 s, Δ ~333_000 µs) would exceed tolerance and FAIL. The measured deltas (333 µs and 33_333 µs) are physically plausible (1 frame at 30 fps = 33_333 µs).
- Winner adapter: src/engines/mediabunny/adapter.ts:1415-1436. Genuine implementation — opens the MediaInput, gets the primary video track, constructs a real `VideoSampleSink`, calls `getSample(targetSec)`, reads `sample.microsecondTimestamp` as the landed PTS, and digests the actual decoded image. No canned output, no copy-input-to-output, no golden short-circuit, no swallowed errors (missing track / missing frame both throw).
- Verdict: **REAL**. Real 31 MB fixture, real demux+hardware-WebCodecs decode, meaningful timestamp oracle that can fail on a mis-seek.
- Cached note: mediabunny's result has `cached: true` (`reason: "cached previous PASS result"`). All five PASS engines are cached, so these numbers were reused, not freshly re-run — minor staleness risk per the launcher-seeding caveat, but the result is internally consistent and the implementation is real.

## Confidence & caveats

- Confidence: **high** on the verdict. The perf gap (1.55x over runner-up; 4.1x–83x over the rest) is large and the correctness tie is unambiguous (one shared oracle, all within tolerance).
- Caveats: (1) Only `seek-accuracy` gates this scenario — a timestamp oracle, not a pixel/SSIM gate — so "correctness" here is landing-PTS, not decoded-pixel fidelity (decode quality is covered elsewhere via ssim-psnr per the oracle comment). (2) All metrics are n=1 (mad=0), so sub-2x margins (mediabunny vs platform wall) are weaker statistically; the longtasks gap (24.6x) reinforces the win. (3) All five PASS results are `cached: true` — re-running fresh could shift absolute timings, though relative ordering (hardware sample-sink < hardware platform pipeline < wasm demux < backpressure streaming) is mechanistically expected to hold.
