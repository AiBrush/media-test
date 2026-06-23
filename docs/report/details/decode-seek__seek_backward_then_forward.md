# decode-seek/seek_backward_then_forward

family: decode-seek | fixture asset: `h264_1080p_30s.mp4` (H.264 / MP4, ~31 MB) | primaryMetric: seekMs | passCount: 5

## Verdict

- **Best framework: mediabunny@1.48.0** (engineId `mediabunny`).
- **Contested**: 5 of 7 engines PASS, and all 5 tie on correctness (seek-accuracy, seekDeltaUs=0µs, landed exactly on the 2,000,000µs keyframe). The decision is therefore made on **performance**.
- **Decisive factor**: lowest seekMs (primary metric) at **59.12 ms**, plus by far the lowest main-thread blocking (longtasks 173 ms).
- **Margin over runner-up** (platform@chrome-149, 88.84 ms): **1.50x faster seek**, and **18.7x less longtask blocking** (173 ms vs 3234 ms). Over the rest: 2.24x vs ffmpeg.wasm (132.26 ms), 3.13x vs web-demuxer (184.77 ms), 49.1x vs remotion-webcodecs (2902.16 ms).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 59.12 ms | n/a | n/a | 173 ms | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true | 88.84 ms | n/a | n/a | 3234 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true | 132.26 ms | n/a | n/a | 4223 ms | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 184.77 ms | n/a | n/a | 3045 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 2902.16 ms | n/a | n/a | 179 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(throughputRealtime and peakMemory are not emitted for this seek scenario; metrics are seekMs/wall/longtasks per the scenario definition at src/scenarios/decode-seek/index.ts:637.)

## Why the winner wins (deep technical)

The operation under test is a **backward seek**: the harness first seeks forward to 8s, then performs the *measured* seek back to the 2s keyframe of `h264_1080p_30s.mp4` (1080p H.264 in a faststart MP4). The hard part is that the decoder must fully **reset its H.264 reference picture state** — a backward seek cannot reuse the forward decode's DPB/reference frames; it must locate the keyframe at-or-before 2,000,000µs (an IDR/recovery point) and re-prime the decoder from there. The oracle confirms correctness: landedPtsUs=2000000, expectedPtsUs=2000000, seekDeltaUs=0 (src/core/oracles.ts:2217-2226 with seekToleranceUs=0 from src/scenarios/decode-seek/index.ts:610).

mediabunny's seek path (src/engines/mediabunny/adapter.ts:1415-1436) is mechanistically lean: it opens the input, gets the primary video track, constructs a `VideoSampleSink` over the track (line 1421) configured via `videoDecoderOptionsForTrack` with the WebCodecs backend (env.configUsed.backend="webcodecs", hwAccel="prefer-hardware"), then calls `sink.getSample(targetSec)` (line 1423). VideoSampleSink resolves the requested time against mediabunny's parsed sample table, finds the keyframe at-or-before the target, and feeds only that GOP slice into a hardware `VideoDecoder` on the M1 Max (ANGLE Metal). Because the sink owns the sample-table index it jumps straight to the keyframe byte range rather than re-scanning, and the decode of one GOP to reach the 2s keyframe completes in 59.12 ms with only 173 ms of cumulative long tasks — meaning the heavy lifting is on the GPU/decoder, not the JS main thread. The pure-TS ESM core (coreBuild="pure-ts-esm", sharedArrayBuffer=false, coopCoep="not-required") means no COOP/COEP gate and no wasm thread spin-up tax.

Contrast the performance mechanism with the losers:
- **platform@chrome-149** (88.84 ms) also uses hardware WebCodecs (backend="webcodecs", hwAccel=true, decode="VideoDecoder") and lands identically (seekDeltaUs=0), but spends 3234 ms in long tasks — its `<video>`/MediaRecorder-flavored pipeline (encode="<video>→canvas→MediaRecorder") and queueDepth=2 streaming path do far more main-thread work to realize the seeked frame, so even though raw seek is only 1.5x slower, the responsiveness gap is 18.7x.
- **ffmpeg.wasm** (132.26 ms, longtasks 4223 ms) is single-threaded wasm software H.264 decode; it must software-decode the GOP to the keyframe, dominating the main thread.
- **web-demuxer** (184.77 ms, longtasks 3045 ms) wraps an FFmpeg-derived wasm demuxer; correct landing but the slowest of the wasm/native-seek group.
- **remotion-webcodecs** (2902.16 ms) is an order of magnitude slower (49x) despite WebCodecs, consistent with a full streaming-backpressure convert pipeline being spun up per seek rather than a direct sample-sink fetch.

The single number that decides it: mediabunny is fastest on the primary metric (seekMs) AND lowest on main-thread blocking, with a clean WebCodecs hardware path and no COOP/COEP requirement.

## What each other framework did wrong

- **platform@chrome-149**: PASS, correct (seekDeltaUs=0) but slower — 88.84 ms seek (1.50x mediabunny) and 3234 ms longtasks (18.7x mediabunny's 173 ms) from its `<video>`/MediaRecorder pipeline doing heavy main-thread work.
- **ffmpeg.wasm@0.12.15**: PASS, correct, but 132.26 ms (2.24x) and 4223 ms longtasks — single-thread wasm software decode of the GOP blocks the main thread.
- **web-demuxer@4.0.0**: PASS, correct, but slowest PASS at 184.77 ms (3.13x) with 3045 ms longtasks — wasm FFmpeg demux overhead.
- **remotion-webcodecs@4.0.479**: PASS, correct, but 2902.16 ms (49.1x) — full streaming-backpressure convert pipeline stood up per seek instead of a direct keyframe fetch.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'seek'". Honest: it is a metadata/parser library, not a decoder, so it genuinely cannot perform a decode-and-land seek.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare operation 'seek'". Honest: mp4box is a demuxer/box parser; it can index samples but does not decode frames, so a decode-landing seek is out of scope.

## Anti-cheat validation

- **Scenario**: src/scenarios/decode-seek/index.ts:600-615 (case `seek_backward_then_forward`), wired into `defineScenario` at lines 618-642 (op:'seek', oracles:['seek-accuracy'], tolerances.seekToleranceUs=0). Real backward-after-forward semantics with priorSeekUs=8,000,000 and tUs=2,000,000.
- **Fixture**: asset `h264_1080p_30s.mp4` exists at fixtures/media/h264_1080p_30s.mp4 (~31 MB, real H.264/MP4). Not synthetic/empty/mock.
- **Oracle**: seek-accuracy at src/core/oracles.ts:2199-2234. Real comparison: computes expected pts via `expectedSeekPtsUs` → `keyframeAtOrBefore` over the golden video packets (lines 2236-2268), then asserts `|landedPtsUs - expectedPtsUs| <= seekToleranceUs`. With seekToleranceUs=0 this is the strictest possible exact-keyframe-pts gate — not loose, not smoke, not ssim with exactFrames==0. Measurements (landedPtsUs=2000000, expectedPtsUs=2000000, seekDeltaUs=0) are physically plausible for the 2s keyframe of a 30s 1080p clip.
- **Winner adapter**: src/engines/mediabunny/adapter.ts:1415-1436. Genuinely calls the real library: `VideoSampleSink` + `sink.getSample(targetSec)`, hardware `VideoDecoder` via `videoDecoderOptionsForTrack`. No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (it throws on missing track/sample).
- **Cached note**: mediabunny's result has `cached=true` ("cached previous PASS result", startedAt 2026-06-22T16:40:21Z). All 5 PASS engines are cached, so the relative ranking is internally consistent (reused, not re-run). Staleness risk is low — fixture and adapter are real — but the seekMs values were not freshly re-measured this run.
- **Verdict: REAL** — real fixture + real WebCodecs implementation + strict zero-tolerance exact-keyframe-pts oracle.

## Confidence & caveats

- Confidence: **high** on correctness (5-way exact tie, seekDeltaUs=0, strict tolerance). **Medium** on the performance ranking precision: all bench samples are **n=1, warmup=1, mad=0** — a single sample per engine, so the 1.50x margin over platform is suggestive, not statistically robust. The order-of-magnitude gaps (vs ffmpeg.wasm, web-demuxer, remotion-webcodecs) are large enough to hold regardless.
- All PASS results are cached (cached=true); no fresh re-run this session.
- throughputRealtime/peakMemory are not collected for this scenario, so the perf decision rests on seekMs + longtasks only.
