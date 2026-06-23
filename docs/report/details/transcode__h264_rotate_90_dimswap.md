# transcode/h264_rotate_90_dimswap

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AAC in MP4, ~31 MB, 30 s) | primaryMetric: wall (with throughputRealtime/encodeFps as transcode rate proxies) | passCount: 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (status PASS).
- **Contested**: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both satisfy the identical oracle set — `property-invariant[transcode-output-metadata]` and `playback-smoke` — so correctness strength is a **tie**.
- **Decisive factor: performance.** With correctness comparable, the win is decided by wall/throughput. mediabunny rotates+re-encodes the full 30 s 1080p clip in **2558.61 ms** vs ffmpeg.wasm's **91189.45 ms**.
- **Margin over runner-up: ~35.6x faster wall** (91189.45 / 2558.61 = 35.6), **35.6x higher real-time throughput** (11.73x vs 0.329x), and **35.6x higher encode FPS** (351.75 vs 9.87 fps). Caveat: both samples are n==1 (mad==0), so the margin is from a single warm run each — but a ~36x gap is far larger than any plausible single-run variance, so the ranking is robust.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 2558.61 | 11.725 | 0 (not sampled) | 2745 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 91189.45 | 0.329 | 0 (not sampled) | 474 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode is NA — MediaRecorder canvas capture does not apply rotation transforms |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | rotated MP4 outputs are not playback-smoke-safe in this package |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: peakMemory and decodeFps have n==0 (not sampled in this transcode row) for both PASS engines, so they cannot break the tie. encodeFps was sampled: mediabunny 351.75 fps vs ffmpeg.wasm 9.87 fps.

## Why the winner wins (deep technical)

**The operation.** This row is an A.16-class "rotate 90° with W↔H dimension swap" on a real upright H.264-in-MP4 1080p/30s asset. `opts = { container: 'mp4', video: { codec: 'h264', rotate: 90 } }`. A correct 90° rotation cannot be a metadata-only display-matrix flip in this suite's intent: the suite wants the **rotation baked into coded pixels** so the output's coded frame dimensions actually swap (1080x1920 from a 1920x1080 source). Because the SSIM reference path is not rotation-aware (it would score a correct rotation near-zero), the scenario deliberately omits ssim-psnr and gates on output container+codec+duration (`property-invariant[transcode-output-metadata]`) plus a real `<video>` playback-smoke (scenario `src/scenarios/transcode/index.ts:653-671`).

**Why mediabunny is correct AND fast.** mediabunny runs the rotation through its Conversion API. The adapter's `buildVideoOptions` sets `opts.rotate = 90` and crucially forces `opts.allowRotationMetadata = false` (`src/engines/mediabunny/adapter.ts:588-598`). That second flag is the mechanistic key: by default mediabunny's `conversion.js canUseRotationMetadata` would emit MP4 with a TKHD/display-matrix rotation flag and leave pixels untouched (a "cheap" rotation that would still pass a loose metadata gate but is not a true pixel rotation). Forcing `allowRotationMetadata:false` makes the Conversion decode→rotate-in-pixel-space→re-encode, producing genuinely rotated coded frames in a fresh H.264/MP4. The whole read→decode→rotate→encode→mux pipeline runs on the **WebCodecs backend with `hwAccel: 'prefer-hardware'`** on an Apple M1 Max (env.configUsed.backend=webcodecs), using `VideoSample.copyTo(RGBA)>canvas` for the pixel stage and a `streaming-lockstep` pipeline with a canvas ring-buffer (`canvasPoolSize:4`), `sharedArrayBuffer:false`, `coopCoep:not-required`. Hardware H.264 encode is exactly why it hits **351.75 encodeFps** and finishes the 30 s clip at **11.73x real-time** in 2.56 s. The oracle confirms the output shape: `mp4, 2 track(s)` with `videoTracks:1`, `durationDeltaSec:0.08s` against a `durationToleranceSec:0.15s` band (passes comfortably), and playback-smoke confirms a real `<video>` decoded a few frames of the rotated output.

**Why ffmpeg.wasm is also correct but loses by 36x.** ffmpeg.wasm performs a genuine rotation too — the adapter emits the real libavfilter `transpose=1` for 90° (`src/engines/ffmpeg-wasm/adapter.ts:2322-2327`) and a real libx264 encode. Its oracle output is actually slightly tighter on duration (`durationDeltaSec:0` vs mediabunny's 0.08), so it is not less correct. But it runs on a **single-thread wasm core** (the adapter defaults to st to avoid SAB/COOP-COEP fragility, per its header comment), with **no GPU encode**: `transpose` + libx264 are pure scalar/SIMD wasm. That collapses throughput to **0.329x real-time / 9.87 encodeFps**, taking **91.19 s** wall (durationMs 265930 total incl. core boot/probe). Same correctness, ~36x slower — pure backend disparity (HW WebCodecs vs single-thread wasm software encode), which is also the explicit tiebreaker (b)/(c) in the decision procedure.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (correct rotation via `transpose=1` + libx264) but lost on performance: 91189.45 ms wall vs 2558.61 ms (~36x slower), 0.329x vs 11.73x real-time, 9.87 vs 351.75 encodeFps. Cause: single-thread wasm software H.264 encode with no hardware acceleration.
- **platform@chrome-149** — NA_ENGINE (honest). Its transcode path is `<video>→canvas→MediaRecorder`; MediaRecorder canvas capture cannot apply a rotation transform to the encoded stream, so it correctly declares rotate transcode unsupported rather than emitting an unrotated fake. Honest NA, not under-declared.
- **remotion-webcodecs@4.0.479** — NA_ENGINE (honest, durationMs 1). It declares transcode but reports that rotated MP4 outputs from this package are not playback-smoke-safe, so it abstains instead of shipping an output that would fail the smoke gate. Honest self-knowledge.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'." It is a demuxer only; honest capability NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'." Parser only; honest capability NA.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Box parser/remuxer only, no encoder; honest capability NA.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:653-671` (case `h264_rotate_90_dimswap`), built via `buildVideoScenario`.
- **Fixture**: asset `h264_1080p_30s.mp4` — confirmed REAL on disk at `fixtures/media/h264_1080p_30s.mp4`, ~31 MB (stat'd). Not synthetic/mock; an upright real H.264/AAC MP4. The scenario `notes` document the gating rationale (ssim-psnr deliberately omitted because the reference is not counter-rotated; a rotation-aware golden bake would be required to gate rotated pixels).
- **Oracle**: `transcodeOutputMetadataInvariant` at `src/core/oracles.ts:3626-3708` (dispatched from line 2651). It re-probes the actual produced output via the reference engine and compares container, duration (vs golden, tolerance band), and requested track shape (`videoOpts` → `compareRequestedTrack`). It is a metadata+duration+track gate, NOT a pixel-rotation gate — by the scenario's own admission. Plus `playback-smoke` (`src/core/oracles.ts:1572+`) which decodes the output in a real `<video>`.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:588-598` (`buildVideoOptions`: `opts.rotate=90`, `allowRotationMetadata:false`) → genuine decode/rotate/re-encode via the Conversion API on WebCodecs. No canned output, no input→output copy, no golden short-circuit, no swallowed errors. ffmpeg.wasm's path (`adapter.ts:2322-2327`, real `transpose=1`) is likewise genuine.
- **Cached note**: BOTH PASS engines have `cached==true` ("cached previous PASS result") — the evidence was reused, not freshly re-run. Per the launcher-seeding caveat, stale PASS reuse is a known staleness risk; a fully honest fresh run would clear the raw + .browser-cache. The measurements are physically plausible (2.56 s @ 11.73x real-time for 30 s HW encode; 91 s @ 0.33x for single-thread wasm; durationDeltaSec 0.08/0.00 within 0.15 s), so nothing looks fabricated.
- **Verdict: WEAK-GATE.** Both implementations are real and the fixture is real, but the correctness gate is metadata + duration + playback-smoke only — it does NOT verify that pixels were actually rotated (the scenario intentionally omits the rotation-aware SSIM golden). An engine that emitted a *metadata-only* rotation (or even no rotation but correct dims) could plausibly satisfy this gate. The winner's PASS is real, but it is not a strong pixel-level correctness proof. Performance ranking, however, is unambiguous and well-grounded.

## Confidence & caveats

- **Confidence: medium.** The winner selection is clear (only 2 PASS, identical oracle set, ~36x performance margin → mediabunny). Lowered from high because: (1) the gate is WEAK (no rotated-pixel verification), so "correctness tie" rests on a metadata/duration/smoke check rather than a bit/SSIM golden; (2) both PASS results are cached (staleness risk); (3) all bench samples are n==1 (mad==0), though the 36x gap dwarfs single-run noise.
- Real pixel correctness of the rotation is asserted via the adapter code path (allowRotationMetadata:false / transpose=1), not proven by the oracle. The scenario notes acknowledge this and point to `h264_rotate_normalize` for a committed rotation-aware golden.
- peakMemory (n==0) was not sampled, so the memory tiebreaker could not be applied.
