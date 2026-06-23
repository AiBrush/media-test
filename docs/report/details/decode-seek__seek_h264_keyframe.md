# decode-seek/seek_h264_keyframe

family: decode-seek | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 / MP4, 1080p, 30s, ~31MB) | primaryMetric: seekMs | passCount: 5/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (5 of 7 engines PASS).
- **Decisive factor: performance.** Correctness is a perfect tie: every PASS engine landed exactly on the 4s keyframe (seekDeltaUs = 0µs, landedPtsUs = 4000000, expectedPtsUs = 4000000) against the seek-accuracy gate with `seekToleranceUs: 0`. With correctness identical, the tiebreaker is `seekMs` (primaryMetric, lower = better).
- **Margin over runner-up:** mediabunny 58.31ms vs platform (Chrome WebCodecs) 101.97ms = **1.75x faster** wall/seek. Also 1.90x faster than ffmpeg.wasm (111.07ms), 2.76x faster than web-demuxer (160.87ms), and 89x faster than remotion-webcodecs (5206.19ms).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:true (Δ0µs) | 58.31 | n/a | n/a | 4863 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:true (Δ0µs) | 101.97 | n/a | n/a | 19963 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true (Δ0µs) | 111.07 | n/a | n/a | 4924 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true (Δ0µs) | 160.87 | n/a | n/a | 19963 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true (Δ0µs) | 5206.19 | n/a | n/a | 3391 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No bench entries for throughputRealtime/peakMemory in this shard; only seekMs/wall/longtasks were measured. The seek and wall samples are identical because seekMs IS the wall metric for this op.)

## Why the winner wins (deep technical)

The operation is a *keyframe* seek to t=4.000s in H.264-in-MP4. Because 4s falls exactly on an IDR keyframe (the scenario asserts `keyframe: true`, `tUs: 4_000_000`), the demuxer can resolve the landing frame directly from the MP4 sample tables (`stss` sync-sample box + `stts`/`ctts` timing) without decoding a partial GOP — the seek reduces to a table lookup plus a single keyframe decode. Every competent engine therefore lands bit-on-time, which is exactly what the shard shows: all five PASS engines report `landedPtsUs: 4000000`, `seekDeltaUs: 0`. The seek-accuracy oracle (src/core/oracles.ts:2199) computes the expected landing via `keyframeAtOrBefore(pkts, 4_000_000)` (oracles.ts:2236) over the golden video packets and demands `|landed − expected| ≤ 0µs`. With correctness saturated, the win is purely about *how fast* each engine gets there.

mediabunny's adapter (src/engines/mediabunny/adapter.ts:1415-1436) opens the input, grabs the primary video track, constructs a `VideoSampleSink` with decoder options derived from the track (`videoDecoderOptionsForTrack`), and calls `sink.getSample(targetSec)` (adapter.ts:1423). `getSample` is mediabunny's purpose-built single-frame random-access primitive: it consults the parsed sample table to find the keyframe at-or-before the target, demuxes only the packets from that keyframe to the target, feeds them to a hardware `VideoDecoder` (env.configUsed.backend = "webcodecs", hwAccel = "prefer-hardware", pipeline = "streaming-lockstep"), and returns the single landed `VideoSample` whose `microsecondTimestamp` (adapter.ts:1426) is reported as `landedPtsUs`. Because the target IS a keyframe, mediabunny only has to demux and decode exactly one frame — no GOP walk, no throwaway frames. Its pure-TS ESM core (`coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`) parses the moov directly and never pays a wasm-module instantiation or a worker round-trip on the seek path, which is why it lands the frame in **58.31ms** — the lowest of any engine and well under half the slowest competent path.

The platform (raw Chrome WebCodecs) baseline at 101.97ms uses the same hardware decoder but pays for a heavier glue path (`decode: VideoDecoder`, `pixelBackend: webgpu>webgl>offscreen2d`, `frameTransfer: transferable`); notably its longtasks total is 19963ms vs mediabunny's 4863ms, indicating far more main-thread blocking around the seek. mediabunny's tighter sink loop and canvas pool (`canvasPoolSize: 4`) keep the main thread freer. The result: mediabunny is 1.75x faster than even the native platform path while producing the identical exact-keyframe landing.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost):** Correct (Δ0µs) but 101.97ms = 1.75x slower than mediabunny on the same WebCodecs hardware backend, and 4.1x more main-thread blocking (longtasks 19963ms vs 4863ms). Heavier per-seek glue (transferable frame handoff, webgpu pixel path) cost it the tiebreak.
- **ffmpeg.wasm@0.12.15 (PASS, lost):** Correct (Δ0µs) but 111.07ms = 1.90x slower. It runs single-thread wasm (no hardware decode), so even a keyframe-only seek carries wasm software-decode overhead the WebCodecs engines avoid.
- **web-demuxer@4.0.0 (PASS, lost):** Correct (Δ0µs) but 160.87ms = 2.76x slower, with longtasks 19963ms — its wasm demux + decode path is the slowest of the competent group besides remotion-webcodecs.
- **remotion-webcodecs@4.0.479 (PASS, lost badly):** Correct (Δ0µs) but 5206.19ms = **89x slower**. Its `streaming-backpressure` / `waitForQueueToBeLessThan` pipeline and buffer-writer appear to buffer/scan far more of the 31MB file than a sample-table seek requires; for a single keyframe seek this is pathological overhead.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — it is a *parser*, not a decoder; it does not declare the `seek` operation (cannot decode a frame to report a landed pts). Correctly excluded.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — mp4box is a demuxer/box parser without a decode-and-land-frame seek op; it does not declare `seek`. Correctly excluded.

## Anti-cheat validation

- **Scenario:** src/scenarios/decode-seek/index.ts:444-453 (`id: 'seek_h264_keyframe'`). Input asset `h264_1080p_30s.mp4`, container mp4, codec h264, tUs 4_000_000, keyframe true, tolerance seekToleranceUs:0. Note: "Seek to a known keyframe at 4s; must land exactly on it."
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4`, 31MB — a genuine 1080p/30s H.264 MP4, not synthetic/empty/mock.
- **Oracle:** src/core/oracles.ts:2199 `seekAccuracy` resolves expected pts from golden packets (`expectedSeekPtsUs` -> `keyframeAtOrBefore`, oracles.ts:2236) and enforces `Δ ≤ 0µs`. This is a strict structural/metadata-exact timestamp gate (tolerance zero), not a wide-open or smoke gate. Measurements (landedPtsUs=4000000, seekDeltaUs=0, expectedPtsUs=4000000) are physically plausible for a 4s keyframe in a 30s clip.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1415-1436 — genuinely opens the input, builds a real `VideoSampleSink`, calls `getSample(targetSec)`, and reports the decoded sample's actual `microsecondTimestamp`. No canned output, no golden short-circuit, no swallowed errors (throws on missing track/frame).
- **Verdict: REAL.** Real 31MB fixture + real library decode path + a strict zero-tolerance timestamp oracle. The one caveat is strength of the gate as a *discriminator*: with seekToleranceUs:0 and a keyframe target, correctness is binary and every competent engine ties, so the win is decided on performance, not correctness depth.
- **Cached note:** ALL five PASS results carry `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness/timing-drift risk applies to the seekMs margins (though the 1.75x+ gaps are large enough to survive modest drift).

## Confidence & caveats

- **Confidence: medium.** The correctness verdict is unambiguous (zero-tolerance exact-keyframe tie, REAL oracle + REAL fixture + REAL adapter). The *performance* winner rests on cached, n=1 samples (warmup 1, mad 0, p95 == median) — a single-shot measurement with no spread, so the exact ratios are soft. However mediabunny's lead (1.75x over the next-best, the native platform path) is wide enough that the ordering is robust to single-run noise.
- The seek/wall metrics are identical by construction (seekMs is the wall for this op); throughputRealtime/peakMemory were not captured in this shard, so the tiebreak relies on seekMs + longtasks only.
- Both NA_ENGINE exclusions (remotion-media-parser, mp4box) are honest: neither tool is a decoder, so neither can implement a frame-landing seek.
