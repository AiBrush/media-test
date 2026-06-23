# trim/h264_frame_accurate

- **family:** trim
- **fixture asset(s):** `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB, real file)
- **primaryMetric:** wall (ms)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, ffmpeg-wasm) with identical oracle coverage.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both pass `trim-boundaries` + `playback-smoke`, both with `boundaryFrameComparisons:0` and a duration delta inside the 0.1s tolerance). mediabunny wins on every wall-clock/throughput metric by a large margin.
- **Margin over runner-up:** mediabunny 755.93 ms vs ffmpeg-wasm 17203.55 ms wall → **22.76x faster**; throughputRealtime 39.69x vs 1.74x → **22.76x higher**. (ffmpeg-wasm wins one secondary metric: longtasks 234 ms vs mediabunny's 4863 ms — see caveats.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:✓, playback-smoke:✓ | 755.93 ms | 39.686x | 0 (not sampled) | 4863 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:✓, playback-smoke:✓ | 17203.55 ms | 1.744x | 0 (not sampled) | 234 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a **frame-accurate trim of `2.033s–7.966s` (requestedDurationSec 5.933s) from a 30s 1080p H.264/AAC MP4**. Frame accuracy means the cut boundaries do not necessarily land on IDR/key frames, so the leading GOP (and trailing region) must be **decoded and re-encoded** rather than stream-copied — both winners therefore run a real video transcode of the boundary region.

**mediabunny's path (the winner):** `src/engines/mediabunny/adapter.ts:1445` `trim()` opens the input, and because `opts.frameAccurate` is true it skips the audio-only packet-copy fast path (`:1479`) and builds a `Conversion` with the exact requested range plus a forced video transcode: `convOpts.trim = { start, end }` (`:1488`) and `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }` (`:1493-1494`), then runs it through `runConversion` → `Conversion.init/execute` (`:1496`, `:842-861`). Per `env.configUsed`, that transcode ran on the **WebCodecs backend** with `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`, and a `canvasPoolSize:4` pixel ring buffer (`pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`). On the M1 Max (`ANGLE Metal Renderer: Apple M1 Max`) this means the H.264 GOP re-encode is offloaded to the hardware VideoToolbox-backed encoder via WebCodecs instead of being computed in scalar wasm. The `trim-boundaries` oracle measured `outDurationSec 6.016s` vs `requestedDurationSec 5.933s` (`durationDeltaSec 0.083s`), comfortably inside the `durationToleranceSec 0.1s` gate, and `playback-smoke` confirmed the muxed output decodes and plays. Result: **wall 755.93 ms, throughputRealtime 39.69x**.

**ffmpeg-wasm's path (the loser, but a valid PASS):** `src/engines/ffmpeg-wasm/adapter.ts:2538` `trim()` with `frameAccurate` true emits a genuine re-encode command: `-i in -map 0 -ss 2.033000 -t 5.933000 -c:v libx264 -pix_fmt yuv420p -preset veryfast` plus `-c:a` for AAC (`:2574-2611`). This is a correct, frame-accurate libx264 transcode — but it runs in the **single-thread wasm core** (no SharedArrayBuffer/COOP-COEP) doing software H.264 encode of 1080p frames. The same oracle measured `outDurationSec 5.999s` / `durationDeltaSec 0.0663s` (also inside tolerance), so it is equally *correct*. It is simply ~22.76x slower (wall 17203.55 ms, throughput 1.744x) because scalar wasm libx264 cannot compete with the M1 Max hardware encoder mediabunny reaches through WebCodecs.

**Why correctness could not break the tie:** the `trim-boundaries` oracle (`src/core/oracles.ts:2348`) currently gates on **duration within tolerance only**; the boundary-frame SHA-256 digest comparison is deliberately disabled because the loaded golden is a source-prefix, not a trim-range golden (`:2405-2431`, `boundaryFrameComparisons:0` in both results). Both engines land inside 0.1s, so the strongest available correctness signal is satisfied identically — performance is the only discriminator, and mediabunny dominates it. Additional tiebreakers all favor mediabunny: hardware WebCodecs vs single-thread wasm, `coopCoep:"not-required"` (no cross-origin-isolation deployment burden), and a streaming-lockstep pipeline vs whole-file MEMFS buffering.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, runner-up):** correct but 22.76x slower on wall (17203.55 ms vs 755.93 ms) and 22.76x lower throughputRealtime (1.744x vs 39.686x). Root cause: software libx264 1080p re-encode in a single-thread wasm core (no SAB/threads) instead of a hardware WebCodecs encoder.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare operation 'trim'. Honest — it is a demux-only library with no muxer/encoder, so it cannot produce a trimmed file.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare operation 'trim'. Honest — a read-only parser (no encode/mux path).
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** does not declare operation 'trim'. Honest — `src/engines/remotion-webcodecs/adapter.ts:245,853` explicitly leave trim/concat/crop undeclared (the lib has no trim primitive; the method throws).
- **mp4box@2.3.0 (NA_ENGINE):** does not declare operation 'trim'. Honest — `src/engines/mp4box/adapter.ts:967` documents that only keyframe-bounded DIY trimming is possible and it is intentionally not declared; frame-accurate trim needs a decoder+encoder mp4box does not provide.
- **platform@chrome-149 (NA_ENGINE):** does not declare operation 'trim'. Honest — `src/engines/platform/adapter.ts:234` sets `trim:false` ("no frame-accurate cut without a muxer"); the bare platform has WebCodecs but no muxer to assemble the output MP4.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:192-205` — `id:'h264_frame_accurate'`, `asset:'h264_1080p_30s.mp4'`, `videoCodec:'h264'`, `audioCodec:'aac'`, `startUs:2_033_000`, `endUs:7_966_000`, `frameAccurate:true`, `tolerances.durationToleranceSec:0.1`, `extraOracles: PLAYABLE_AV`. Notes: "Frame-accurate 2.033s–7.966s; leading GOP re-encoded; boundary frames vs golden."
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4` confirmed present, ~31 MB real H.264/AAC MP4. Not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1445-1496` — genuine `Conversion` with `trim` range and `video.forceTranscode:true` + hardware acceleration; no canned output, no input→output copy, no golden short-circuit, no error swallowing. The only copy path (`:1468-1477`) is a guarded no-op-trim identity that requires start≈0 AND end≈duration — not triggered here (start=2.033s), so a real transcode ran.
- **Oracle:** `src/core/oracles.ts:2348` `trimBoundaries` — performs a real duration comparison against the requested range (`:2388-2400`) and would also do SHA-256 boundary-frame digest checks when a trim-range golden exists (`:2413-2431`). Measurements are physically plausible (outDuration ~6.0s for a 5.933s request; ~2 frames of quantization).
- **Verdict:** **WEAK-GATE.** The fixture, both implementations, and the oracle's duration check are all real, but the strongest correctness signal (boundary-frame SHA-256 digest) is **disabled** for this run (`boundaryFrameComparisons:0`) because only a source-prefix golden is loaded, not a trim-range golden. The PASS is genuine but rests on a ±0.1s duration tolerance plus a smoke playback — it does not actually verify the cut is frame-accurate at the pixel level. Both engines clear this gate, so the winner is decided purely on performance.
- **Cached note:** BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence is reused, not freshly re-run; per the launcher seeding caveat there is staleness risk, but the per-metric numbers are internally consistent and plausible.

## Confidence & caveats

- **Confidence: medium.** The performance margin (22.76x) is enormous and unambiguous, and the NA declarations for the other five engines are all honest (verified in their adapters). What lowers confidence: (1) both results are `cached:true` (not freshly re-run); (2) the gating oracle is duration-only here (`boundaryFrameComparisons:0`), so "frame-accurate" is not actually pixel-verified — a WEAK-GATE; (3) all bench metrics have **n==1** (single sample, mad=0, p95==median), so the timing is one observation, not a distribution.
- **Counter-signal:** ffmpeg-wasm beats mediabunny on **longtasks** (234 ms vs 4863 ms). ffmpeg runs in a worker so the main thread stays free, whereas mediabunny's WebCodecs+`VideoSample.copyTo(RGBA)>canvas` pixel path executes on the main thread and blocks it for ~4.86s. For pure wall-clock/throughput mediabunny still wins decisively, but on a latency-sensitive UI thread ffmpeg's worker isolation is the better citizen — worth noting for the leaderboard.
- **peakMemory/targetWrites not sampled** (n==0) for either engine, so memory could not be used as a tiebreaker.
