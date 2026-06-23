# trim/h264_keyframe_aligned

family: trim | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AVC video + AAC audio in MP4, 31 MB) | primaryMetric: throughputRealtime | passCount: 2 of 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **Contested**: 2 engines PASS (ffmpeg-wasm, mediabunny). Both pass the identical oracle set (`trim-boundaries` + `playback-smoke`), so correctness is comparable and the decision falls to performance.
- **Decisive factor: wall-clock / realtime throughput.** ffmpeg.wasm performed the 2s–8s keyframe-aligned copy-trim in **136.72 ms** vs mediabunny's **653.98 ms** — a **4.78x faster** wall median — at **219.43 x-realtime** vs **45.87 x-realtime** (**4.78x** throughput). Its main-thread blocking (longtasks) was also far lower: **4410 ms vs 19963 ms** (4.53x less). It also produced a tighter boundary: durationDelta **0.016 s** vs mediabunny's **0.080 s** (both well inside the 1.1 s GOP-slack tolerance).
- **Margin over runner-up (mediabunny): 4.78x faster wall, 4.78x higher realtime throughput, 4.53x less long-task time.** Caveat: both samples are n==1 (no spread to estimate variance), so the magnitude is a single-shot measurement — but the gap is large enough to be decisive.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 136.72 ms | 219.43 x | 0 (not sampled) | 4410 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 653.98 ms | 45.87 x | 0 (not sampled) | 19963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

peakMemory is reported as 0 with samples n==0 for both engines (the metric was not sampled in this run), so it carries no signal here.

## Why the winner wins (deep technical)

The operation is a **keyframe-aligned (copy) trim** of an H.264/AVC elementary stream multiplexed with AAC in an MP4 container, cutting the 2.000s–8.000s sub-range (`startUs: 2_000_000`, `endUs: 8_000_000`, `frameAccurate: false`). Because `frameAccurate` is false, the correct and fast strategy is to *avoid re-encoding entirely*: seek to the nearest preceding IDR keyframe and stream-copy the GOP-aligned packet range into a new container. The scenario explicitly budgets one GOP of slack per boundary (`durationToleranceSec: 1.1`).

ffmpeg.wasm takes exactly this path. In `src/engines/ffmpeg-wasm/adapter.ts:2613-2627`, the non-`frameAccurate` branch builds the canonical fast-trim invocation: `-ss <start>` placed **BEFORE** `-i` (input seek to the nearest preceding keyframe), then `-t <duration>`, then **`-c copy`** (stream copy, no decode/re-encode). It adds `-avoid_negative_ts make_zero` (adapter.ts:2629) so the first packet's DTS/PTS rebases to zero, and for MP4 output it appends `-movflags +faststart` (adapter.ts:2630-2631) to relocate the `moov` atom to the front so the trimmed file is immediately playable. Because no codec is instantiated and no frames are decoded, the work is essentially demux + bitstream copy + remux — which is why it ran at **219.43 x-realtime** and produced a duration of **6.016 s** (durationDelta **0.0160 s** vs requested 6 s; oracle measurement `outDurationSec: 6.016015625`). The 0.016 s residual is exactly the kind of tiny offset expected from snapping the cut to the nearest keyframe / sample boundary — physically plausible for a real copy-trim of this asset.

mediabunny PASSes correctly but is slower for a mechanistic reason visible in its `env.configUsed`: it ran `backend: "webcodecs"`, `pixelBackend: "VideoSample.copyTo(RGBA)>canvas"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`. That is a **decode-driven** pipeline — it brought up a WebCodecs VideoDecoder, decoded samples and routed them through a canvas/RGBA copy path, which is far more work than a pure packet copy for a trim that does not need pixels. Its durationDelta was **0.080 s** (`outDurationSec: 6.08`), 5x looser than ffmpeg's boundary though still within tolerance. The decode + GPU-copy work is also why its longtasks total is **19963 ms** (4.53x ffmpeg's) and its throughput only **45.87 x-realtime**. For a copy-trim where bytes need only be re-windowed, the WebCodecs decode round-trip is pure overhead, and ffmpeg.wasm's `-c copy` short-circuit dominates despite running on a single-thread wasm core (`wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`).

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (trim-boundaries + playback-smoke both true) but lost on performance: 653.98 ms wall (4.78x slower), 45.87 x-realtime (4.78x lower throughput), 19963 ms longtasks (4.53x more main-thread blocking), and a looser boundary (durationDelta 0.080 s vs 0.016 s). Its WebCodecs decode→RGBA→canvas pipeline (`env.configUsed.pixelBackend`) does decode work unnecessary for a keyframe copy-trim.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA: mp4box.js is a fragmenting/parsing/segmenting library; it can demux and re-segment but exposes no first-class range-cut + remux primitive, so not declaring `trim` is defensible (a sub-range copy-trim would require hand-rolled sample-table surgery).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: media-parser is a read-only demuxer/probe library, no muxing/writing capability, so it genuinely cannot produce a trimmed output container.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Looks honest for the copy case; remotion-webcodecs is encode/convert-oriented (re-encode), and a keyframe copy-trim is not in its declared op set. (A frame-accurate re-encode trim could plausibly be in scope, but this scenario is copy-mode, so the NA is reasonable here.)
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the raw browser platform (WebCodecs + MediaSource) has no built-in container-level trim/remux op; building one would require a userland muxer, which the platform adapter does not claim.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: web-demuxer is a demux-only wasm wrapper (ffmpeg-based demuxing to packets); it has no muxer to write a trimmed file.

All five NA_ENGINE results are capability declarations (the runner skipped them because the adapter does not register `trim`), not runtime failures. None look like an under-declared capability for this *copy*-trim case: the only libraries here that can both demux and re-mux a byte range are ffmpeg.wasm and mediabunny, and both competed.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/trim/index.ts:138-151` — id `'h264_keyframe_aligned'`, `asset: 'h264_1080p_30s.mp4'`, container mp4, videoCodec h264, audioCodec aac, range 2s–8s, `frameAccurate: false`, tolerance 1.1 s, extraOracles `PLAYABLE_AV` (= `['playback-smoke']`, defined at index.ts:125). Notes: "Copy-trim 2s–8s snapping to keyframes; duration within one GOP of requested."
- **Fixture exists**: `fixtures/media/h264_1080p_30s.mp4` is present, **31 MB** real media file (verified via stat). Not synthetic/empty/mock.
- **Oracle implementation**: `src/core/oracles.ts:2348-2435` (`trimBoundaries`). It fails fast if `ctx.output` is empty (oracles.ts:2350), probes the trimmed output via the reference engine (oracles.ts:2360-2367), falls back to decoded frame-PTS span as a duration proxy (oracles.ts:2379-2383), computes `durationDeltaSec` and fails if it exceeds `durationToleranceSec` (oracles.ts:2394-2400). This is a real measurement against the actual output bytes, not trivially satisfiable. The boundary-frame digest comparison is deliberately *skipped* here because the loaded golden is a source-prefix, not a trim-range golden (oracles.ts:2405-2430; `boundaryFrameComparisons: 0` in the shard) — this is documented and conservative, not a cheat; it just means the gate rests on duration + playback-smoke for this case.
- **Winner adapter**: `src/engines/ffmpeg-wasm/adapter.ts:2538-2645` (`trim`). The copy path (adapter.ts:2613-2627) issues a genuine `-ss / -t / -c copy / -movflags +faststart` ffmpeg invocation via `this.run(args)` (adapter.ts:2636) and reads real output bytes via `this.readBinary(outName)` (adapter.ts:2637). No canned output, no input→output passthrough, no short-circuit to a golden file, no error swallowing (errors throw; NA paths throw NotApplicableError).
- **Cached note**: ffmpeg.wasm's result has `cached: true` ("cached previous PASS result"), and so does mediabunny. Both numbers are reused from prior runs, not freshly re-executed in this run — minor staleness risk, but the underlying code paths are genuine and the measurements are physically plausible.
- **Verdict: REAL.** Real 31 MB H.264/AAC MP4 fixture, genuine ffmpeg.wasm `-c copy` keyframe-trim implementation, and a real duration-comparison oracle backed by a playback-smoke gate. The only weakness is that boundary-frame bit-exactness is not asserted (no trim-range golden), so this is a strong-but-not-bit-exact gate.

## Confidence & caveats

- **Confidence: high** for the winner pick (4.78x performance margin with identical correctness gates is unambiguous).
- Both winning numbers are `cached: true` and `n == 1` (median == p95, mad == 0): the magnitude of the margin is a single-shot measurement, so treat the exact ratios as indicative rather than statistically tight.
- The gate is duration + playback-smoke only (`boundaryFrameComparisons: 0`); bit-exact boundary-frame verification is not in force, so PASS proves "playable container of the right length," not "byte-identical to a hand-verified trim golden."
- peakMemory was not sampled (n==0) for either engine, so memory was not a usable tiebreaker.
