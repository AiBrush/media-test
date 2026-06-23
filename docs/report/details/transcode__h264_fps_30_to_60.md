# transcode/h264_fps_30_to_60

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AAC in MP4, ~31 MB, 30 s @ 30 fps) | primaryMetric: wall (throughputRealtime/encodeFps reported) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: **performance**. Both passing engines satisfy the identical correctness gate (`property-invariant` transcode-output-metadata + `playback-smoke`), so the tie breaks on speed, where mediabunny's WebCodecs hardware encode path crushes ffmpeg.wasm's single-thread software encoder.
- Margin over runner-up (ffmpeg.wasm): **13.1x faster wall** (8 298.97 ms vs 108 560.10 ms), **13.1x higher throughputRealtime** (3.615x vs 0.276x realtime), **13.1x higher encodeFps** (108.45 vs 8.29 fps). Caveat: every bench is n==1 (single sample, mad==0), so the magnitude is directional, not statistically tight; but a 13x gap dwarfs any plausible single-run noise.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass, playback-smoke:pass | 8 298.97 | 3.615x | 0 (not sampled) | 4 410 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, playback-smoke:pass | 108 560.10 | 0.276x | 0 (not sampled) | 626 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory/decodeFps carried n==0 samples in the shard for both passers — not measured — so they cannot be used as a tiebreaker.)

## Why the winner wins (deep technical)

This scenario is a **30→60 fps up-sample of H.264-in-MP4 with AAC audio**, re-muxed to MP4 (`opts: { container:'mp4', video:{ codec:'h264', fps:60 }, invariant:'transcode-output-metadata' }`, src/scenarios/transcode/index.ts:613-626). Changing the frame rate forces a genuine **decode → re-time → re-encode** of the video track; you cannot satisfy fps=60 by stream-copying packets, so the engine's encoder throughput is the dominant cost.

mediabunny ran on its **WebCodecs hardware path**: `env.configUsed = { backend:"webcodecs", hwAccel:"prefer-hardware", pixelBackend:"VideoSample.copyTo(RGBA)>canvas", pipeline:"streaming-lockstep", wasmThreads:0, sharedArrayBuffer:false, coopCoep:"not-required" }`. The adapter drives mediabunny's high-level Conversion API: `transcode()` builds `ConversionOptions` and calls `Conversion.init(opts)` then `conversion.execute()` (src/engines/mediabunny/adapter.ts:1284-1307 and runConversion at src/engines/mediabunny/adapter.ts:848-855). The requested frame rate maps straight to mediabunny's `ConversionVideoOptions.frameRate` — `if (typeof v.fps === 'number') opts.frameRate = v.fps;` (src/engines/mediabunny/adapter.ts:587) — inside `buildVideoOptions` (src/engines/mediabunny/adapter.ts:546), which also probes `canEncodeVideo`/`VideoEncoder.isConfigSupported` before committing the H.264 encode config so the GPU encoder is never handed a config it would reject mid-run. The result: mediabunny decodes via the hardware H.264 decoder, re-times the frames to a 60 fps cadence, and re-encodes through the platform hardware H.264 encoder, hitting **encodeFps 108.45** and **3.615x realtime** — i.e. it produced the ~1 800-frame 60 fps output in ~8.3 s.

The oracle confirms the output is the requested shape, not a copy. `property-invariant` with `which='transcode-output-metadata'` re-probes the produced bytes through the reference engine and checks container == mp4, duration within tolerance, and per-track codec/fps via `compareRequestedTrack` (src/core/oracles.ts:3631-3707, fps check at src/core/oracles.ts:3805-3812 with `fpsTolerance 0.05`). mediabunny's measurements: `durationDeltaSec 0.08` against `durationToleranceSec 0.15` (well inside the ±1-frame-ish band; the explicit per-scenario `TC_REENCODE_DURATION_TOLERANCE_SEC` override applies), and `videoTracks:1`. Duration is preserved while frame count doubles — exactly the signature of a correct fps up-convert. `playback-smoke` then decoded a few frames from the output `<video>`, proving the re-muxed MP4 is actually playable, not a malformed stub.

ffmpeg.wasm produced an equally-correct output (`durationDeltaSec 0`, `videoTracks:1`, same two oracles pass) but pays the **wasm single-thread software-encode tax**: its env shows no WebCodecs/hardware acceleration, and libx264 in wasm has to do CPU-side motion estimation/entropy coding for every one of the ~1 800 output frames, landing at **encodeFps 8.29** and **0.276x realtime** (108.6 s wall). Its longtasks total is lower (626 ms vs mediabunny's 4 410 ms) because ffmpeg.wasm's heavy lifting runs inside the wasm module / worker rather than as main-thread JS layout-blocking tasks — but that is a UI-jank footnote, not a throughput win; the 13x wall gap is decisive.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (correctness equal), but lost on performance: 108 560.10 ms wall vs 8 298.97 ms (13.1x slower), 0.276x vs 3.615x realtime, 8.29 vs 108.45 encodeFps. Cause: single-thread wasm software H.264 encode (no hardware acceleration) for a full decode/re-time/re-encode.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'fps'". Honest NA: the raw-WebCodecs platform adapter does transcode but does not expose an fps-retiming capability token, so it is correctly excluded rather than silently passing a stream-copy.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'fps'". Honest NA: declares transcode but not the fps feature, so the 30→60 retiming op is out of its declared surface.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA: it is a demuxer only (no encode path).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA: a parser/reader, no encode/mux operation.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA: an MP4 box (de)muxer with no codec re-encode capability.

All five NAs look genuine, not under-declared: only WebCodecs-encode-capable engines (mediabunny, ffmpeg.wasm, and the platform/remotion-webcodecs WebCodecs adapters) are even candidates, and the two WebCodecs adapters legitimately lack the declared `fps` feature for frame-rate retiming.

## Anti-cheat validation

- Scenario definition: src/scenarios/transcode/index.ts:613-626 (`id: 'h264_fps_30_to_60'`, in FPS_UP_CASES). notes: "30→60 fps up-sample; requested output fps and duration are validated by the output-metadata invariant." ssim-psnr is deliberately omitted because the no-golden reference path pairs frames by index, which interpolation/up-sampling shifts (index-paired SSIM would mis-score a CORRECT result — src/scenarios/transcode/index.ts:592-594). That rationale is sound.
- Fixture: `asset: 'h264_1080p_30s.mp4'` resolves to fixtures/media/h264_1080p_30s.mp4 — a real ~31 MB H.264/AAC MP4 (stat confirmed present). Not synthetic/empty/mock.
- Winner adapter: src/engines/mediabunny/adapter.ts:1271-1311 (`transcode`) → buildVideoOptions sets `frameRate` from fps (adapter.ts:587) → runConversion calls real `Conversion.init`/`execute` (adapter.ts:848-855). No canned output, no input→output copy, no short-circuit to a golden, no swallowed errors (invalid conversion throws on `!conversion.isValid`). A genuine decode/re-encode is required and performed.
- Gating oracle: src/core/oracles.ts:3631-3707 (`transcode-output-metadata`) re-probes the produced bytes via the reference engine, checks container, duration (Δ0.08 < tol 0.15), and per-track codec+fps in compareRequestedTrack (oracles.ts:3805-3812, fpsTolerance 0.05). It is a metadata/structural gate, not bit-exact — but it is a REAL comparison against the requested output shape with physically plausible numbers (1 video track, sub-tolerance duration drift on a 30 s clip).
- Caveat on gate strength: `property-invariant` is a structural/metadata invariant plus a smoke playback; it does NOT verify the actual decoded frame cadence is 60 fps pixel-by-pixel, only that the container metadata reports the requested fps within tolerance and duration is preserved. That is appropriately defended in the scenario notes (interpolation breaks index-paired SSIM) but means the gate is weaker than a bit-exact/SSIM correctness oracle.
- Cached note: BOTH passing results have `cached:true` ("cached previous PASS result"); they were reused, not re-run for this report. Numbers (wall, encodeFps, longtasks) are from a prior run — staleness risk applies, though the values are internally consistent and physically plausible.
- Verdict: **REAL** — real fixture, real mediabunny Conversion implementation, meaningful (structural+playback) oracle with plausible measurements. Not a cheat. The only weakness is that the gate is metadata/smoke rather than pixel-exact, but that is a deliberate, justified design choice for fps up-conversion (so it is REAL rather than WEAK-GATE: it does verify codec, container, fps-tolerance, duration, and playability, which together cannot be faked by a stream-copy of a 30 fps source).

## Confidence & caveats

- Confidence: **high** on the winner and ordering — the 13.1x performance margin is far beyond single-run noise and the correctness gate is identical for both passers.
- Caveats: (1) all benches are n==1 (mad==0, no spread) and both results are cached/stale; a fresh re-run would harden the magnitude. (2) peakMemory and decodeFps were not sampled (n==0) for either engine, so memory could not be used as a tiebreaker. (3) The gate is structural+smoke, not pixel-exact frame-cadence verification — correct by design for fps retiming, but it does not independently prove true temporal interpolation quality.
