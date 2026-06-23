# transcode/h264_fps_30_to_15

Family: transcode | Fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC 1080p clip) | primaryMetric: throughputRealtime (x-realtime) | passCount: 2 / 7

Operation: temporal resample — re-encode H.264-in-MP4 (with AAC audio) from 30 fps to 15 fps, output MP4 H.264. Index-paired SSIM is unsound for frame-dropping, so the scenario overrides oracles to `property-invariant` (transcode-output-metadata) + `playback-smoke` and gates duration within a small re-encode band.

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED (2 engines PASS: mediabunny and ffmpeg.wasm@0.12.15).

Both passing engines satisfied the EXACT same oracle set with the same strictness — `property-invariant` (transcode-output-metadata) and `playback-smoke` both pass for each. Correctness is therefore a tie, and the decision falls to performance.

Decisive factor: throughput / wall time. mediabunny ran the conversion in **1558 ms** wall vs ffmpeg.wasm's **50 684 ms** — a **32.5x faster** wall-clock margin. On the primary metric throughputRealtime, mediabunny hit **19.26x realtime** vs ffmpeg.wasm's **0.59x** (32.5x ratio; ffmpeg.wasm is below realtime). encodeFps: 577.7 vs 17.8 (32.5x). The gap is the hardware WebCodecs (Apple M1 Max, prefer-hardware) pipeline vs single-thread wasm software x264.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass, playback-smoke:pass | 1558.0 ms | 19.255 x | 0 (not sampled) | 3234 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, playback-smoke:pass | 50683.6 ms | 0.592 x | 0 (not sampled) | 2577 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fps' |

Measurements (mediabunny): durationDeltaSec 0.08 ≤ tol 0.15; videoTracks 1. (ffmpeg.wasm): durationDeltaSec 0.0 ≤ tol 0.15; videoTracks 1. peakMemory/decodeFps have n==0 (not sampled this run) for both.

## Why the winner wins (deep technical)

This is a re-encode (not a copy): halving the frame rate forces every output frame to be re-encoded, so the bottleneck is the H.264 encode + decode loop. The two passing engines take fundamentally different backends.

mediabunny runs the conversion through its `Conversion` API (`src/engines/mediabunny/adapter.ts` `runConversion` at line 842, `Conversion.init`/`execute` read→decode→encode→mux pipeline; the adapter's `configUsed.pipeline` is "streaming-lockstep"). The fps target is wired in `buildVideoOptions` at `src/engines/mediabunny/adapter.ts:587` — `if (typeof v.fps === 'number') opts.frameRate = v.fps;` — handing `frameRate: 15` to mediabunny, which performs real temporal resampling during the encode rather than a container hack. Crucially `configUsed.backend` is `webcodecs` with `hwAccel: prefer-hardware` on an Apple M1 Max (ANGLE Metal). The H.264 decode and re-encode both run on the platform's hardware VideoDecoder/VideoEncoder, so the 30s 1080p clip transcodes at 19.26x realtime (encodeFps 577.7). No COOP/COEP and no SharedArrayBuffer required (`coopCoep: not-required`, `sharedArrayBuffer: false`).

ffmpeg.wasm produces a correct output too — same two oracles pass, durationDelta exactly 0.0s — but it runs the libx264 software encoder inside a single-thread wasm core (the adapter defaults to single-thread to avoid SAB/COOP fragility; see `src/engines/ffmpeg-wasm/adapter.ts:10`). Software x264 encoding 30s of 1080p in wasm with no SIMD threads is the cause of the 50.7s wall / 0.59x realtime / 17.8 encodeFps — roughly 32x slower than the hardware path. Correctness is identical; the entire margin is the encoder backend.

The gating oracle is `transcodeOutputMetadataInvariant` (`src/core/oracles.ts:3626`). It re-probes the produced MP4 via the reference engine, checks the container matches the requested `mp4`, checks duration against the source golden within the re-encode band (`durationDeltaSec` vs `durationToleranceSec` 0.15; mediabunny Δ0.08, ffmpeg.wasm Δ0.0), and compares the requested video track shape in `compareRequestedTrack` (`src/core/oracles.ts:3778`) — codec h264 and fps within `fpsTolerance` (line 3808). Both engines clear all checks. `playback-smoke` (`src/core/oracles.ts:1572`) confirms a real `<video>` element decoded and played frames of each output, proving the MP4 is genuinely playable, not a malformed/empty file.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct but 32.5x slower wall (50683.6 ms vs 1558.0 ms), 0.592x vs 19.255x realtime, encodeFps 17.8 vs 577.7. Cause: single-thread wasm libx264 software encode (`src/engines/ffmpeg-wasm/adapter.ts:10`) vs mediabunny's hardware WebCodecs encoder. Each metric is n==1, so the spread is unmeasured (mad==0), but the gap is an order of magnitude — robust against noise.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "does not declare operation 'transcode'". Honest — remotion-media-parser is a parser/demuxer, it has no encode path; not an under-declaration.
- **mp4box@2.3.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — MP4Box.js is a box-level (de)muxer with no decode/encode; cannot re-encode H.264.
- **web-demuxer@4.0.0** (NA_ENGINE): "does not declare operation 'transcode'". Honest — it is a wasm demuxer only, no encoder.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "does not declare feature 'fps'". It DOES declare `transcode` (adapter.ts:244) and features `resize`/`rotate` (adapter.ts:274) but not `fps`, so the runner gates the fps temporal-resample feature out. Honest gating: convertMedia's declared video transforms in this adapter are resize/rotate, not frame-rate retiming, so it correctly abstains rather than over-claim.
- **platform@chrome-149** (NA_ENGINE): "does not declare feature 'fps'". The platform adapter declares `transcode: true` (LIMITED canvas→MediaRecorder, adapter.ts:232) but not the `fps` feature. Honest — MediaRecorder cannot target an arbitrary precise output fps, and the adapter's transcode is video-only/lossy/real-time, so it abstains on the fps retiming case rather than fake it.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:219` (id `h264_fps_30_to_15`), asset `h264_1080p_30s.mp4`, opts `{container:'mp4', video:{codec:'h264', fps:15}}`, `oraclesOverride:['property-invariant','playback-smoke']`, `optsInvariant:'transcode-output-metadata'`. Notes explicitly justify dropping SSIM: "Index-paired SSIM is unsound for frame dropping, so output metadata checks requested fps/container/codec and preserves duration within a small re-encode band."
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real 1080p H.264/AAC clip, not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:587` sets `opts.frameRate = v.fps`; `runConversion` (line 842) calls the real `mb.Conversion.init`/`execute` (decode→encode→mux). No canned output, no input→output copy, no short-circuit to a golden, no swallowed errors (invalid conversion throws, line 852).
- Oracle: `transcodeOutputMetadataInvariant` (`src/core/oracles.ts:3626`) re-probes the produced bytes and checks container + duration band + codec + fps tolerance (`compareRequestedTrack`, line 3778; fps assertion line 3808 with a null-fps guard at 3810). It is a real comparison against the probed output and the source duration golden — not trivially satisfiable. `playback-smoke` (line 1572) requires a real `<video>` to decode frames. Measurements are physically plausible: durationDelta 0.08s / 0.0s within 0.15s, 1 video track.
- Verdict: **WEAK-GATE**. Implementation and fixture are real and the oracle is a genuine comparison, but for this fps-retiming case the gate is metadata/structural only (container+codec+fps+duration) plus a smoke playback check — there is no pixel/SSIM correctness assertion (deliberately dropped because index-paired SSIM mis-pairs dropped frames), and the surfaced measurements report only `videoTracks` not the achieved fps value. The PASS is real but does not prove frame-accurate temporal resampling fidelity, only that the output metadata matches and the file plays.
- Cached note: BOTH passing engines have `cached==true` ("cached previous PASS result"). Numbers were reused, not re-run this session — staleness risk. Per launcher-seeding caveat, a fresh run (clear raw + .browser-cache) would confirm these timings are current.

## Confidence & caveats

Confidence: medium-high on the winner pick (the 32.5x performance gap dwarfs any measurement noise, and correctness is a confirmed tie). Caveats: (1) both results are cached, so timings are not freshly measured this session; (2) all bench metrics are n==1 (mad==0, no spread), so per-metric variance is unknown — but the order-of-magnitude gap makes the ranking safe; (3) peakMemory and decodeFps were not sampled (n==0), so the memory tiebreaker is unavailable; (4) the gate is metadata+smoke only — no pixel-fidelity proof for the dropped-frame output, hence WEAK-GATE.
