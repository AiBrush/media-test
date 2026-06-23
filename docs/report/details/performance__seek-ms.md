# performance/seek-ms

- family: performance
- fixture asset: `h264_1080p_30s.mp4` (H.264 High @ 1080p, 30 s, faststart MP4; AAC audio) — 31 MB in `fixtures/media/`
- golden: `fixtures/golden/h264_1080p_30s.mp4.packets.json` (264 KB; 2308 packets — track 0 video = 900 pkts / 15 keyframes at exact 2 s GOP boundaries, track 1 audio = 1408 pkts)
- primaryMetric: `seekMs` (lower-better; seekMs = wall / seeks, seeks = 1)
- passCount: 5 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** — CONTESTED (5 engines PASS the gate).
- Decisive factor: correctness is a flat tie (every PASS engine landed on the exact requested video keyframe, `landedPtsUs = 14000000`, `seekDeltaUs = 0`), so ranking falls to the primary performance metric `seekMs`. mediabunny has the lowest seek latency at **57.44 ms**.
- Margin over runner-up (platform @ 89.005 ms): **1.55x faster wall/seek** (89.005 / 57.44). Versus ffmpeg-wasm (131.26 ms): **2.29x**; versus web-demuxer (141.74 ms): **2.47x**; versus remotion-webcodecs (10159.19 ms): **176.8x**.
- Evidence strength caveat: n = 1 (single sample, mad = 0, p95 = median) for every engine, and every PASS result is `cached==true`. The latency ordering is consistent with the demux-path differences below, but a single-sample win is weaker evidence than a multi-run median.

## Per-engine results

| engine | status | oracles passed | seekMs (wall) median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass (Δ0µs) | 57.44 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:pass (Δ0µs) | 89.005 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass (Δ0µs) | 131.26 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass (Δ0µs) | 141.74 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass (Δ0µs) | 10159.19 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(The shard records only `seekMs`/`wall` benches; throughputRealtime / peakMemory / longtasks were not emitted for this latency-only scenario.)

## Why the winner wins (deep technical)

The operation is a single random-access seek into a 30 s faststart H.264/MP4 to the mid-file video keyframe at 14_000_000 µs (the 8th of 15 GOP boundaries). Because the requested time is exactly a video IDR boundary, an engine that resolves the sample table correctly can jump straight to that keyframe and decode one frame — no inter-frame walk is required. The gate (`seek-accuracy`) only checks the landed PTS against the golden packet table, so all five PASS engines are functionally identical on correctness (`landedPtsUs = 14000000`, `seekDeltaUs = 0`, `expectedPtsUs = 14000000`). The race is therefore purely about how fast each engine gets from "open container" to "landed frame."

mediabunny's seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) opens the input, grabs the primary video track, builds a `VideoSampleSink`, and calls `sink.getSample(targetSec)` (line 1423) which performs a sample-table-indexed seek to the keyframe at-or-before the target and decodes exactly that one `VideoSample`; it then reads `sample.microsecondTimestamp` (line 1426) for the landed PTS. The config used (`backend: webcodecs`, `hwAccel: prefer-hardware`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) shows it decodes the single IDR frame through hardware WebCodecs while parsing the MP4 with a pure-TS demuxer — there is no wasm instantiation cost and no thread/COOP-COEP setup tax on the critical path. That combination of (a) a direct index-based seek to the keyframe and (b) a zero-warmup hardware-WebCodecs single-frame decode is what produces the 57.44 ms figure.

platform@chrome-149 (89.005 ms, 1.55x slower) uses the browser's native `<video>`/`VideoDecoder` element-driven seek (config: `backend: webcodecs`, `hwAccel: true`, `decode: VideoDecoder`, `pixelBackend: webgpu>webgl>offscreen2d`, `frameTransfer: transferable`). It also lands exactly on the keyframe but pays the element/media-pipeline setup and frame-transfer overhead that mediabunny's lean sink path avoids.

ffmpeg.wasm (131.26 ms, 2.29x slower) and web-demuxer (141.74 ms, 2.47x slower) both route through a single-thread wasm demuxer (libav). They are correct (Δ0µs) but incur wasm module/seek overhead and a software demux of the sample table before the keyframe can be served, which dominates a latency-only metric.

remotion-webcodecs is the outlier at 10159.19 ms (176.8x slower). Its config exposes the cause: `pipeline: streaming-backpressure` with `adapterFastPaths` for "mp4-sample-table:http-range for selected large/progressive MP4/MOV demux rows." For a seek it appears to stream/parse forward through the file rather than index-jump to the keyframe, so even though it ultimately lands on the exact PTS (Δ0µs, correct), the wall time reflects a near-linear scan of the 31 MB file rather than a true random-access seek. It passes correctness but loses the performance contest by two orders of magnitude.

## What each other framework did wrong

- **platform@chrome-149** — PASS but slower: 89.005 ms vs 57.44 ms (1.55x). Correctness identical (Δ0µs). Lost on native element/transfer setup overhead.
- **ffmpeg.wasm@0.12.15** — PASS but slower: 131.26 ms (2.29x). Single-thread wasm libav demux/seek overhead on the latency metric.
- **web-demuxer@4.0.0** — PASS but slower: 141.74 ms (2.47x), the slowest of the genuine random-access seekers. wasm demux overhead.
- **remotion-webcodecs@4.0.479** — PASS but catastrophically slow: 10159.19 ms (176.8x). Streaming-backpressure pipeline scans toward the target instead of index-jumping; correct PTS but not a real O(1) seek for this metric.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — mp4box is a demuxer/parser without a decode-to-frame seek operation; it does not expose the `seek(input, tUs) -> {landedPtsUs, frame}` contract, so it negotiates out rather than under-declaring a capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — it is a parser; producing a landed decoded frame is out of scope, so it correctly declines the op.

## Anti-cheat validation

- Scenario: `src/scenarios/performance/decode-encode-seek.ts:98-114` (id `performance/seek-ms`), target `tUs = 14_000_000` (`:96`), gate `oracles: ['seek-accuracy']`, tolerance `seekToleranceUs: 50_000`.
- Fixture: `BIG_READ_GOLDEN = 'h264_1080p_30s.mp4'` (`src/scenarios/performance/_shared.ts:71`). Confirmed present: `fixtures/media/h264_1080p_30s.mp4` (31 MB). Real H.264/MP4, not synthetic/empty/mock.
- Golden: `fixtures/golden/h264_1080p_30s.mp4.packets.json` (264 KB) — verified by direct parse: 2308 packets, track 0 video = 900 pkts with 15 keyframes at exact 2 s GOP boundaries (0, 2_000_000, …, including 14_000_000 µs), track 1 audio = 1408 pkts. Physically plausible for 30 s 30fps/2s-GOP H.264. The requested 14_000_000 µs is a real video keyframe.
- Oracle: `seekAccuracy` `src/core/oracles.ts:2199-2234`; expected-PTS resolution `expectedSeekPtsUs` `:2250-2268` and `keyframeAtOrBefore` `:2236-2248`. It compares the engine's `landedPtsUs` against the golden-derived expected PTS and fails when `|landed - expected| > 50_000 µs`. This is a real timestamp comparison against the baked packet table, not trivially satisfiable: a broken seek that lands at file start or the wrong GOP is ≥ 2_000_000 µs off — 40x outside the band. Note the tolerance is widened deliberately (per scenario notes lines 23-31) to accept audio- or video-keyframe snap; all engines beat it with Δ0µs, so the gate is not the limiting factor but it is genuine.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1415-1436`. Genuinely calls the real library — `VideoSampleSink` + `sink.getSample(targetSec)` (`:1421-1423`), reads `sample.microsecondTimestamp` (`:1426`), digests the actual decoded `VideoSample` (`:1427-1428`). No canned output, no input→output copy, no golden short-circuit, no swallowed errors (missing track / missing frame both `throw`).
- Verdict: **REAL**. Real fixture, real golden packet table, real library decode-and-seek, meaningful timestamp oracle. The only softness is the deliberately wide 50 ms tolerance (rationale documented in the scenario), but every engine lands exactly (Δ0µs), so correctness is unambiguous.
- Cached note: the winner (and all PASS engines) have `cached==true` ("cached previous PASS result"). The seekMs numbers were reused, not freshly re-run, so the exact latency margins carry staleness risk; the correctness landings (Δ0µs) are robust regardless.

## Confidence & caveats

- Confidence: medium. Correctness ordering is unambiguous (all 5 PASS land Δ0µs). The performance ranking is consistent with the documented demux strategies (index-jump hardware-WebCodecs vs streaming-scan vs single-thread wasm), but every measurement is n=1 (mad=0, p95=median) and `cached==true`, so the precise 1.55x margin over platform should be treated as a single-sample estimate rather than a stable median.
- The gate tolerance (50_000 µs) is wide by design; it would not distinguish a video-accurate from audio-snap landing, but here it does not matter because all engines hit the exact video keyframe.
- mp4box and remotion-media-parser NAs are honest capability declines for a decode-to-frame seek op, not under-declared capabilities.
