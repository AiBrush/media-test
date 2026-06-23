# trim/h264_subframe_range_frame_accurate

family: trim | fixture asset: `h264_1080p_30s.mp4` (31 MB real H.264/AAC MP4) | primaryMetric: wall (default; no scenario override) | passCount: 2

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**
- Contested: **yes** (2 PASS — ffmpeg-wasm and mediabunny; 5 NA_ENGINE).
- Decisive factor: **performance / completion**. Both engines pass the identical single gate (`trim-boundaries`, duration-only) with equal correctness strength. They tie on correctness, so the tiebreak is performance — and ffmpeg-wasm actually **completed its benchmark** (wall median **1532.58 ms**, throughputRealtime **19.57x**, longtasks 4707 ms, n=1), whereas mediabunny's bench **timed out** (`bench timeout: operation exceeded timeout of 120000ms`, durationMs 123775) and produced **no bench block at all**. A frame-accurate sub-frame trim forces a boundary re-encode; ffmpeg's single-thread libx264 path finished it ~80x under the timeout, mediabunny's WebCodecs `forceTranscode` path blew past 120 s.
- Margin over runner-up: ffmpeg-wasm completed in ~1.5 s wall vs mediabunny exceeding the 120 s bench ceiling — effectively **>78x** on the only directly comparable wall figure (mediabunny has no median to quote because it never finished a bench loop).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:pass | 1532.58 ms | 19.57x | 0 (n=0) | 4707 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:pass | n/a (bench timed out) | n/a | n/a | n/a | cached: bench timeout: operation exceeded timeout of 120000ms |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The scenario (`src/scenarios/trim/index.ts:561-576`) requests a **sub-frame, frame-accurate** cut: `startUs=6_000_000`, `endUs=6_010_000` — a 10 ms window, shorter than one 33 ms frame interval at 30 fps. With `frameAccurate: true`, the requirement is that the engine still emits at least the single enclosing video frame plus muxer/audio padding; tolerance is `durationToleranceSec: 0.1`. The input is real H.264 video + AAC audio in MP4. A degenerate sub-frame frame-accurate trim cannot be served by a keyframe-copy fast path — the boundary GOP must be **decoded and re-encoded** to land an exact start frame, which is the expensive operation both winners actually perform.

ffmpeg-wasm's frame-accurate branch (`src/engines/ffmpeg-wasm/adapter.ts:2574-2612`) places `-ss`/`-t` **after** `-i` (line 2576-2586), which forces ffmpeg to decode then seek, guaranteeing a frame-exact cut rather than snapping to a preceding keyframe. It then re-encodes video with `libx264` at `-pix_fmt yuv420p -preset veryfast` (line 2592-2594) and re-encodes AAC audio. Because the requested span is tiny, the encoder only has to touch the single enclosing GOP boundary, so the whole job is small: the bench reports a **wall median of 1532.58 ms** with **19.57x realtime throughput** (n=1) and 4707 ms of long-task time. The `trim-boundaries` oracle (`src/core/oracles.ts:2388-2400`) measured `outDurationSec=0.05436s` against `requestedDurationSec=0.01s`, a delta of **0.04436s**, comfortably under the 0.1 s tolerance. That ~54 ms output is the single enclosing frame plus AAC packet padding — physically plausible for a one-frame re-encode of 30 fps content.

mediabunny (`src/engines/mediabunny/adapter.ts:1484-1496`) is also a genuine transcode: it builds a `mediabunny.Output`/`BufferTarget`, sets `trim: { start, end }`, and — because `frameAccurate` is true — sets `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }` (line 1493-1494) so the boundary is honored exactly rather than key-frame-snapped, running through WebCodecs (`env.configUsed.backend="webcodecs"`, `hwAccel="prefer-hardware"`, `pipeline="streaming-lockstep"`). It **passed the same oracle** (`outDurationSec=0.08533s`, delta `0.07533s`, still < 0.1). But its bench loop **exceeded the 120 s timeout** (`durationMs=123775`, reason `bench timeout: operation exceeded timeout of 120000ms`) and emitted **no bench metrics**. On this Apple M1 Max / ANGLE-Metal host the WebCodecs `forceTranscode` round-trip for a tiny clip is dominated by encoder init / VideoSample.copyTo(RGBA)>canvas readback and lockstep queue overhead rather than the trivial frame count, so it never converged within the loop budget. Correctness is equal; ffmpeg's single-thread wasm libx264 path is the one that actually delivered a measurable, fast result.

Decisive factor restated: with correctness tied (both pass the duration-only gate, both skip boundary-frame digest), the runner ranks by performance, and only ffmpeg-wasm has finite, fast bench numbers — mediabunny did not finish a bench iteration.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): real WebCodecs `forceTranscode` trim, passed `trim-boundaries` (delta 0.0753s < 0.1), but its bench **timed out at >120 s** (durationMs 123775, no bench block emitted). It produced a correct output but could not be timed; ffmpeg-wasm beats it by >78x on the only comparable wall axis.
- **mp4box@2.3.0** — NA_ENGINE: `engine does not declare operation 'trim'`. Honest: mp4box is a demux/box-parser library with no encode/transcode path, so a frame-accurate trim is genuinely out of scope.
- **web-demuxer@4.0.0** — NA_ENGINE: `does not declare operation 'trim'`. Honest: a demuxer only, no muxing/re-encode capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `does not declare operation 'trim'`. Honest: a parser/probe library, not an editor.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: `does not declare operation 'trim'`. Arguably under-declared (it wraps WebCodecs and could in principle transcode-trim), but for this suite it does not register the `trim` op, so it is excluded rather than failed.
- **platform@chrome-149** — NA_ENGINE: `does not declare operation 'trim'`. Honest: the raw-platform engine exposes decode/demux primitives, not a one-call trim operation.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:561-576` (id `h264_subframe_range_frame_accurate`, asset `h264_1080p_30s.mp4`, container mp4, h264/aac, startUs 6_000_000, endUs 6_010_000, frameAccurate, durationToleranceSec 0.1, extraOracles BOUNDARIES_ONLY).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` **exists, 31 MB** real H.264+AAC MP4 (not synthetic/mock). Golden present (`fixtures/golden/h264_1080p_30s.mp4.{frames,meta,packets,ssim}.json`).
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2346-2435`. It performs a **real duration check** — probes/decodes the actual output and compares `outDurationSec` vs the scenario range, failing if `|delta| > durationToleranceSec` (line 2394). Boundary-frame digest comparison is **intentionally skipped** (line 2405-2431) because the loaded golden is a source-prefix, not a trim-range golden — documented, not a cheat, but it does make this a duration-only gate.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2538-2612` — genuine ffmpeg.wasm invocation; `-ss/-t` after `-i` forces decode+re-encode (libx264 veryfast). No canned output, no input->output copy, no golden short-circuit, no swallowed errors (it throws on malformed/mutated/out-of-domain input, lines 2550-2561).
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the PASS is real, but the single gate is **duration-only** (no decoded-frame / boundary-digest comparison, boundaryFrameComparisons=0), so it verifies the clip is roughly the right length, not that the exact enclosing frame was emitted bit-correctly. Real but not a strong correctness proof.
- Cached note: ffmpeg-wasm result is **cached==true** ("cached previous PASS result"); mediabunny is also **cached==true** (cached bench timeout). Both rows are reused, not freshly re-run — staleness risk applies, and mediabunny's timeout in particular may differ on a fresh run.

## Confidence & caveats

- Confidence: **medium**. The winner is clear (only ffmpeg-wasm has finite bench numbers and it passes), but the evidence has two soft spots: (1) the gate is duration-only / WEAK-GATE, so neither engine proves frame-exact output here; (2) both PASS rows are cached, and ffmpeg's bench is n=1 (mad=0, no spread), so the perf figure is single-sample.
- mediabunny "loses" largely because its bench timed out rather than because it produced worse output — its correctness was equivalent. If re-run with a longer bench budget it might produce competitive numbers, but as recorded it has none.
- 5 of 7 engines are NA_ENGINE for not declaring `trim`; all look honest except possibly remotion-webcodecs (WebCodecs-capable but not wired for trim in this suite).
