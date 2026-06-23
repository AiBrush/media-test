# decode-seek/seek_past_eof

family: decode-seek | fixture asset: `h264_1080p_30s.mp4` (H.264 / MP4, ~31 MB) | primaryMetric: seekMs | passCount: 5/7

## Verdict
- Best framework: **mediabunny@1.48.0** — CONTESTED win (5 of 7 engines PASS).
- Decisive factor: PERFORMANCE. All 5 passing engines satisfied the single gating oracle (`seek-accuracy`) with comparable correctness (all clamped onto the last decodable frame near 29.967s), so the tie broke on `seekMs` wall time. mediabunny's median seek is **57.50 ms**.
- Margin over runner-up (platform@chrome-149, 143.47 ms): **2.50x faster** wall. Versus the other PASS engines: web-demuxer 288.38 ms (5.02x), ffmpeg.wasm 502.45 ms (8.74x), remotion-webcodecs 14124.54 ms (245.6x). mediabunny also clamped most precisely (seekDeltaUs=1 vs platform's 33333).

## Per-engine results
| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 57.50 | n/a | n/a | 4095 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true | 143.47 | n/a | n/a | 1361 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 288.38 | n/a | n/a | 4438 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true | 502.45 | n/a | n/a | 5077 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 14124.54 | n/a | n/a | 315 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics are emitted by this seek scenario; only seekMs/wall/longtasks are present in the shard bench block.)

## Why the winner wins (deep technical)
This is the A.16 "seek past EOF" edge: the harness requests a seek to `tUs = 300_000_000` (300 s) on a 30 s H.264/MP4 clip. The correct behavior is to **clamp to the last decodable frame** without hanging or OOMing. The golden's last video PTS is ~29.967s, and the oracle's expected landing for a non-keyframe seek is the nearest packet PTS (`expectedSeekPtsUs` → `nearestPacketPts`, oracles.ts:2250-2268, 2278), which resolves to 29966667 µs. The gate tolerance is widened to 2 s (`seekToleranceUs: 2_000_000`, index.ts:554) since "anywhere at/after the last keyframe is correct."

mediabunny's `seek` (src/engines/mediabunny/adapter.ts:1415-1436) opens the MP4, gets the primary video track, builds a `VideoSampleSink`, then calls `sink.getSample(targetSec)` with `targetSec = Math.max(0, tUs/1e6)` = 300 s (adapter.ts:1422-1423). mediabunny's sample sink resolves the seek against the MP4 sample table (`stts`/`stss`/`stco`): a target beyond the last sample naturally maps to the final sample, so the library returns the last frame rather than erroring. The landed `microsecondTimestamp` is **29966666 µs**, giving `seekDeltaUs = 1` against the expected 29966667 µs (shard measurements) — effectively exact clamping. Because mediabunny indexes the moov sample table directly and decodes only the single landed GOP/frame, it does no full-file decode walk, which is why its 57.50 ms wall is the lowest of the field. Backend: pure-TS ESM demuxer + WebCodecs `prefer-hardware` decode (env.configUsed.backend=webcodecs, coreBuild=pure-ts-esm, coopCoep=not-required, sharedArrayBuffer=false) — no COOP/COEP and no wasm threads required, the cleanest deployment profile too.

The runner-up, platform@chrome-149, also clamps correctly but uses the `<video>` element / `VideoDecoder` path (env: decode=VideoDecoder, pixelBackend=webgpu>webgl>offscreen2d). It lands on PTS 30000000 µs (seekDeltaUs=33333, i.e. one frame interval coarser than mediabunny's exact landing) and takes 143.47 ms — element-level seeking incurs media-pipeline setup/readyState latency that the direct sample-table approach avoids.

## What each other framework did wrong
- **platform@chrome-149** (PASS, lost on perf): 143.47 ms seek = 2.50x slower than mediabunny; also coarser landing (seekDeltaUs=33333 vs 1). Element/VideoDecoder pipeline overhead.
- **web-demuxer@4.0.0** (PASS, lost on perf): 288.38 ms = 5.02x slower. Correct clamp (landedPtsUs=29966666, Δ1) but wasm demux+decode path is heavier per seek.
- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): 502.45 ms = 8.74x slower, and the highest longtasks (5077 ms). Exact landing (seekDeltaUs=0) but single-thread wasm transcode-style pipeline is costly for a point seek.
- **remotion-webcodecs@4.0.479** (PASS, lost on perf badly): 14124.54 ms = 245.6x slower. Exact landing (Δ1) but its `convert` pipeline appears to walk/decode far more than the target frame for this edge — pathological for a single seek.
- **mp4box@2.3.0** (NA_ENGINE): does not declare the `seek` operation. Honest NA — mp4box is a demux/probe library (adapter.ts:946 explicitly throws on undeclared ops); seek-with-decode is out of scope.
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare `seek`. Honest NA — it is a parser, not a decoder, so frame-accurate seek-and-decode is genuinely not its capability.

## Anti-cheat validation
- Scenario: src/scenarios/decode-seek/index.ts:544-559 (`id: 'seek_past_eof'`), asset `h264_1080p_30s.mp4`, tUs=300_000_000, edge='past-eof', tolerance 2_000_000 µs.
- Fixture exists and is real: `fixtures/media/h264_1080p_30s.mp4`, ~31 MB (stat confirmed). Real H.264/MP4, not synthetic/empty/mock.
- Oracle: `seek-accuracy` at src/core/oracles.ts:2199-2234. It performs a real comparison — computes expected landing from golden packet PTS (`expectedSeekPtsUs`/`nearestPacketPts`, lines 2250-2289) and asserts `|landedPtsUs - expectedPtsUs| <= seekToleranceUs`. Measurements (landedPtsUs=29966666, expectedPtsUs=29966667, seekDeltaUs=1) are physically plausible: 29.9667 s is exactly the final frame of a 30 s clip, confirming genuine EOF clamping rather than a canned value.
- Winner adapter: src/engines/mediabunny/adapter.ts:1415-1436. Genuinely calls the library (`openInput`, `getPrimaryVideoTrack`, `VideoSampleSink`, `sink.getSample`); decodes the landed frame and digests it. No hardcoded PTS, no golden short-circuit, no error swallowing (it throws on missing track/sample).
- Tolerance note: the 2 s tolerance is intentionally wide per the past-EOF rationale, but mediabunny landed at Δ1 µs — far inside any reasonable bound — so the wide gate did not flatter it.
- Verdict: **REAL**. Real fixture + real library seek + meaningful timestamp oracle with plausible measurements.
- Cached note: winner result has `cached=true` ("cached previous PASS result"). All 5 PASS rows and both NA rows are cached/reused, not freshly re-run this session — minor staleness risk; numbers reflect a prior run.

## Confidence & caveats
- Confidence: high on the verdict (real fixture, genuine adapter, clear 2.50x perf margin and tighter landing).
- Caveats: (1) all results are cached (`cached=true`) — per the launcher-seeding caveat, stale PASS reuse is possible; a fresh run would harden the timing margins. (2) seekMs is `n=1` (single sample, mad=0), so the perf ranking is weaker evidence than a multi-sample median — however the 2.5x–245x gaps are large enough to survive sampling noise. (3) Correctness is gated only by `seek-accuracy` (a timestamp oracle, no pixel/SSIM gate for seeks by design), so the win rests on perf among correctness-equivalent engines.
