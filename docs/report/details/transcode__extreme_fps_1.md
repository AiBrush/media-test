# transcode/extreme_fps_1

family: transcode | fixture asset: `h264_1080p_30s.mp4` (31 MB, real H.264/AVC 1080p, 30 s, AAC audio) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- Decisive factor: **performance**. Both engines pass the *same* two oracles (`property-invariant` probe-duration + `playback-smoke`) with equal correctness strength, so the tie breaks on speed. mediabunny is ~14.6x faster wall and ~14.6x higher realtime throughput.
- Margin over runner-up (ffmpeg.wasm): wall **821.7 ms vs 12,019.7 ms = 14.63x faster**; throughputRealtime **36.51x vs 2.496x = 14.63x higher**; encodeFps **1095.3 vs 74.9 = 14.6x higher**. Both n=1 (single sample, mad=0), so the margin is large enough to be decisive despite low sample count.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 821.71 ms | 36.509x | 0 (not sampled) | 4410 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 12019.67 ms | 2.496x | 0 (not sampled) | 3234 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is an **extreme frame-rate decimation re-encode**: H.264-in-MP4 (1080p, 30 fps, 30 s) → H.264-in-MP4 at **fps = 1** (scenario `src/scenarios/transcode/index.ts:1431-1444`, `opts.video.fps: 1`, `invariant: 'probe-duration'`). Because the output keeps only ~1 frame per second, frame-index-paired SSIM is meaningless (frames no longer line up), so the scenario deliberately gates on a metamorphic **duration-preservation** invariant plus a playback smoke test (`oraclesOverride: ['property-invariant','playback-smoke']`, note at line 1443: "index SSIM unsound").

mediabunny ran on `env.configUsed`: `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required`, `canvasPoolSize: 4`. Its `transcode()` (`src/engines/mediabunny/adapter.ts:1271-1322`) drives the library's real **Conversion API**: it opens the MP4 input, builds `ConversionVideoOptions` via `buildVideoOptions`, where `opts.frameRate = v.fps` is set directly from the requested fps (`src/engines/mediabunny/adapter.ts:587`), then `Conversion.init` + `conversion.execute()` runs read→decode→encode→mux to a `BufferTarget` (`src/engines/mediabunny/adapter.ts:842-868`, `runConversion`). The H.264 decode and the H.264 re-encode at the decimated rate both go through hardware WebCodecs on the Apple M1 Max GPU (ANGLE Metal), with the encode config pre-probed via `canEncodeVideo`/`VideoEncoder.isConfigSupported` so the GPU encoder is never handed a config it would reject mid-stream. The result: **encodeFps 1095.3**, **wall 821.7 ms**, **36.5x realtime** to transcode a 30 s clip.

ffmpeg.wasm passes the identical oracles but is a **single-thread wasm** software H.264 codec (libx264 software encode, libavcodec software decode) running in the main heap. It has no GPU path, so the same decimating re-encode costs **encodeFps 74.9** (14.6x slower encode), **wall 12,019.7 ms**, and only **2.496x realtime** — plus a wasm warmup/IO tax. The correctness outcome is the same caliber: both clear the duration invariant within tolerance, so the win is purely the hardware-WebCodecs vs software-wasm throughput gap.

Oracle measurements (real, from the shard): the `property-invariant` probe-duration oracle (`src/core/oracles.ts:2709-2759`) re-probes the produced output with the reference engine and compares against the golden source duration. mediabunny: `outDurationSec 30.08`, `goldenDurationSec 30`, `deltaSec 0.08`, `durationToleranceSec 0.15` → PASS (Δ 0.08 ≤ 0.15). ffmpeg.wasm: `outDurationSec 30`, `goldenDurationSec 30`, `deltaSec 0`, tol 0.15 → PASS (exact). ffmpeg's Δ=0 is tighter, but the duration oracle is a binary within-tolerance gate, not a ranked-tolerance metric, so both count as equal correctness; the 0.08 s mediabunny drift (one extra ~1-fps frame boundary) is well inside the ±0.15 s band and does not affect ranking. `playback-smoke` (`src/core/oracles.ts:1572+`) confirmed each output played a few frames in `<video>`.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed, lost on performance only: 14.63x slower wall (12,019.7 ms vs 821.7 ms), 14.63x lower realtime throughput (2.496x vs 36.509x), 14.6x lower encodeFps (74.9 vs 1095.3). Cause: single-thread wasm software H.264 codec, no GPU/WebCodecs path. Slightly tighter duration delta (Δ 0 vs 0.08) but that does not promote it under the duration-invariant gate.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'fps'". Honest NA — the raw-WebCodecs platform adapter doesn't expose an fps-retiming transcode op (it lacks the conversion/retiming layer mediabunny wraps around WebCodecs).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'fps'". Honest NA — it does transcode but does not declare the `fps` retiming feature this scenario requires.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — web-demuxer is a demux-only library; encoding/transcoding is out of scope.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — mp4box is an MP4 box parser/remuxer, no codec/encode capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a parser/probe library, not a transcoder.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1431-1444` (`id: 'extreme_fps_1'`, `asset: 'h264_1080p_30s.mp4'`, `features: ['fps']`, `opts.video.fps: 1`, `invariant: 'probe-duration'`, `oraclesOverride: ['property-invariant','playback-smoke']`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists — confirmed via stat, **31 MB**, a real H.264/AVC 1080p 30 s clip (not synthetic/empty/mock).
- Gating oracle: `property-invariant` probe-duration branch `src/core/oracles.ts:2709-2759` — re-probes the *authored output* with the reference engine and compares to the golden source duration with a real numeric tolerance (0.15 s); not trivially-true. `playback-smoke` `src/core/oracles.ts:1572+` actually decodes a few frames in `<video>`.
- Winner adapter: mediabunny `transcode()` `src/engines/mediabunny/adapter.ts:1271-1322`; fps→frameRate wiring `:587`; real `Conversion.init`/`execute` `:848-855`; output via `BufferTarget` `:819-838`. The transcode is genuinely executed through the library's WebCodecs-backed Conversion pipeline — no canned output, no input→output copy, no golden short-circuit, no swallowed errors (invalid conversions throw at `:849-853`; degenerate dims throw at `:1280`).
- Verdict: **WEAK-GATE**. The implementation, fixture, and reference-probe comparison are all real, and the measurements (out 30.08 s vs golden 30 s) are physically plausible. However the gate is a duration-preservation property + playback smoke, NOT a pixel-fidelity oracle (bit-exact / SSIM). This is a *justified* design choice (index-paired SSIM is unsound under heavy fps decimation, per the scenario note), but it means PASS proves "output is a playable MP4 of the right duration," not "frames are correct." Hence WEAK-GATE rather than REAL.
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result"); ffmpeg.wasm also `cached: true`. Both rows were reused, not freshly re-run — there is staleness risk (per the launcher seeding caveat). The relative ranking is robust to this since the speed gap is ~14.6x, far larger than any plausible caching jitter.

## Confidence & caveats

- Confidence: **high** on the winner identity and the ~14.6x performance margin (clear, large, consistent across wall/throughput/encodeFps).
- Caveats: (1) both PASS rows are `cached` — not re-run this cycle. (2) bench samples are n=1 with mad=0, so spread is unknown; the margin's size carries the decision despite this. (3) The gate is property+smoke (WEAK-GATE), so neither engine's *pixel* correctness for the decimation is verified here. (4) peakMemory was not sampled (n=0) for either engine, so the memory tiebreaker is unavailable.
