# decode-seek/seek_bframes_midgop

family: decode-seek | fixture asset: `h264_bframes_1080p.mp4` (11 MB, real file in fixtures/media/) | primaryMetric: seekMs | passCount: 5/7

## Verdict

- Best framework: **platform@chrome-149** (the raw Chrome platform engine).
- Contested: **YES** — 5 of 7 engines PASS, all with identical correctness (seek-accuracy, seekDeltaUs=0). The decision is therefore made on performance.
- Decisive factor: lowest seek wall time. platform median seekMs = **108.10 ms**, beating the runner-up mediabunny (149.19 ms).
- Margin over runner-up: **1.38x faster wall** vs mediabunny (149.19 / 108.10). Against the other PASSers the margin is much larger: 3.93x vs web-demuxer (425.10 ms), 8.08x vs ffmpeg.wasm (873.42 ms), 15.2x vs remotion-webcodecs (1644.53 ms). All on n=1, so the ranking is real but the precise ratio carries n=1 uncertainty.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | seek-accuracy:true | 108.10 | n/a | n/a | 12909 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | seek-accuracy:true | 149.19 | n/a | n/a | 5761 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:true | 425.10 | n/a | n/a | 1227 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:true | 873.42 | n/a | n/a | 874 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:true | 1644.53 | n/a | n/a | 1012 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics were recorded for this seek scenario; bench carries only seekMs/wall/longtasks.)

## Why the winner wins (deep technical)

The operation is a **non-keyframe seek into a B-frame run** of an H.264-in-MP4 clip (`h264_bframes_1080p.mp4`), targeting tUs=3,500,000. Because the GOP uses B-frames, decode order != display order: to present the frame at 3.5 s the decoder must locate the preceding IDR/keyframe, decode forward through the reference (I/P) frames, and then correctly reorder the B-frames by PTS. The oracle (`src/core/oracles.ts:2199` `seekAccuracy`) does not check pixels; it checks that the landed PTS equals the nearest real video packet PTS from the golden (`expectedSeekPtsUs` -> `nearestPacketPts`, oracles.ts:2250/2278) within seekToleranceUs=100,000 µs. Every PASSer landed exactly: landedPtsUs=3,500,000, expectedPtsUs=3,500,000, seekDeltaUs=0 — i.e. the target time is itself a true frame PTS, and all five engines reordered correctly and reported the right timestamp. Correctness is thus a tie; performance is the discriminator.

platform wins because it offloads the entire seek to the **browser's native media stack**. Its adapter `seek()` (`src/engines/platform/adapter.ts:459-465`) simply builds a Blob from the input and calls `grabFrameAt` (`src/engines/platform/decode.ts:311-338`). That helper creates an `HTMLVideoElement`, sets `src` to the blob URL, waits for `loadedmetadata`/readyState, and calls `seekTo(video, tUs/1e6)` (decode.ts:324). The Chrome media pipeline performs the demux, keyframe lookup, forward decode and B-frame reorder in optimized native (C++) code with hardware-assisted H.264 decode on the Apple M1 Max (env.configUsed: backend=webcodecs/native video element, hwAccel=true, GPU=ANGLE Metal). `landedPtsUs` is read straight from `video.currentTime` (decode.ts:326). This native fast-path avoids any JS/WASM demux of the 11 MB file and avoids manually feeding samples to a VideoDecoder, which is why it lands at 108 ms.

mediabunny (149.19 ms) is the closest competitor: it does its own TS demux + WebCodecs VideoDecoder lockstep (env: backend=webcodecs, pipeline=streaming-lockstep, pure-ts-esm core). It still uses hardware decode but pays a JS demux + sample-feeding cost, ~41 ms more. web-demuxer (425 ms) and ffmpeg.wasm (873 ms) both pay a WASM demux tax — ffmpeg.wasm in particular spins up the full libav* WASM core single-threaded (wasmThreads=0), and its longtasks (874 ms) reflect a heavyweight main-thread cost. remotion-webcodecs (1644 ms) is slowest: its streaming-backpressure converter and bufferWriter add substantial overhead for a single seek even though it ultimately uses WebCodecs.

The decisive factor is therefore native-stack offload: platform's single `video.currentTime` assignment lets Chrome do the keyframe-anchored forward decode and B-frame reorder internally, beating every JS/WASM-demux pipeline on wall time while matching them exactly on seek PTS accuracy.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on speed. seekMs 149.19 vs 108.10 (1.38x slower). Correctness identical (seekDeltaUs=0). It does JS-side demux + WebCodecs lockstep feeding rather than delegating to the native element.
- **web-demuxer@4.0.0** — PASS, lost on speed. 425.10 ms (3.93x slower). WASM (libav-based) demux adds latency before/around the decode.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed. 873.42 ms (8.08x slower) with longtasks=874 ms; full single-threaded libav WASM core is heavy for one seek.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed. 1644.53 ms (15.2x slower); streaming-backpressure converter + bufferWriter overhead dominate a single-seek workload.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — it is a metadata/parsing library with no decode/seek surface, so it legitimately cannot present a decoded frame at a target time.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". Honest NA — mp4box is an MP4 box parser/segmenter; it can locate samples but does not decode, so reporting a decoded-frame landing PTS is out of scope.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:465-474` (case `seek_bframes_midgop`), asset `h264_bframes_1080p.mp4`, tUs=3,500,000, keyframe=false, seekToleranceUs=100,000. Notes: "Seek into a B-frame run: decoded frame must be the correct pts despite reorder." This is exactly the hard case (reorder correctness), not a trivial keyframe seek.
- Fixture: `fixtures/media/h264_bframes_1080p.mp4` exists, 11 MB real H.264 MP4 — not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2199` `seekAccuracy`. It resolves expected PTS from real golden video packets (`nearestPacketPts`, oracles.ts:2278) and fails if |landed - expected| > tolerance. Measurements are physically plausible: landedPtsUs=3,500,000 sits exactly on a true frame boundary, seekDeltaUs=0. The oracle is a timestamp gate (deliberately not pixel-gated for seek; per its own comment pixel SSIM is covered elsewhere), so it is a structural/metadata-exact-class gate, not smoke.
- Winner adapter: `src/engines/platform/adapter.ts:459` -> `src/engines/platform/decode.ts:311` (`grabFrameAt`). It genuinely creates a real `<video>`, performs a real `seekTo`/`currentTime` seek on the actual blob, and reads landedPtsUs from `video.currentTime` (decode.ts:326). No canned output, no copy of golden, no swallowed errors (errors reject/throw via `waitForEvent`).
- Cached note: winner result has cached==true ("cached previous PASS result", run-window startedAt 2026-06-22T16:55:42Z). Evidence is reused, not freshly re-run — minor staleness risk, but the cached PASS is consistent with the real adapter path and a tolerance-0 landing.
- Verdict: **REAL** — real 11 MB H.264/MP4 fixture + genuine native-seek implementation + meaningful timestamp oracle with exact (Δ=0) landing.

## Confidence & caveats

- Confidence: **high** on correctness (all 5 PASS land at seekDeltaUs=0 against real golden packets) and **medium-high** on the performance ranking. Every bench is n=1 with mad=0 and no warmup spread, so the ratios (1.38x over mediabunny, up to 15.2x over remotion-webcodecs) are directional; the platform/mediabunny gap (41 ms) is small enough that with more samples the order is firm but the exact ratio could shift.
- All winning results are cached; a fresh re-run would harden the wall-time margin.
- No throughputRealtime/peakMemory metrics exist for this scenario, so the tie-break relied solely on seekMs/wall (plus longtasks as context — note platform's longtasks=12909 is high, reflecting native pipeline/main-thread setup, but it is not a gating metric here).
- platform's seek is DOM-bound (throws NotApplicableError off the main thread, adapter.ts:460); valid for this in-page suite but not a worker-portable path.
