# transcode/h264_to_vp9_webm

family: transcode | fixture asset: `h264_1080p_30s.mp4` (fixtures/media/, 31 MB, real H.264/AAC in MP4) | primaryMetric: throughputRealtime | passCount: 2 of 7

Operation: mp4/H.264/AAC -> webm/VP9/Opus. The WebM container forces an audio re-encode AAC -> Opus in addition to the H.264 -> VP9 video re-encode (scenario notes, src/scenarios/transcode/index.ts:97).

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED (2 engines PASS: mediabunny and remotion-webcodecs). Correctness is a tie (both pass exactly the same two oracles with the same reference-source SSIM proxy), so the decisive factor is **performance**. Mediabunny wins on every reported metric:

- wall median 4571.6 ms vs 6305.4 ms -> **1.38x faster**
- throughputRealtime 6.562x vs 4.758x -> **1.38x higher** (primaryMetric)
- encodeFps 196.87 vs 142.73 -> **1.38x higher**
- longtasks 1361 ms vs 19963 ms -> **14.67x less main-thread blocking** (the largest margin)

Both runs are n=1 and cached=true, so the magnitude is single-sample evidence; the direction is consistent across four independent metrics, which strengthens confidence in the ordering even if the exact ratios are noisy.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 4571.6 ms | 6.562x | 0 (n=0, not measured) | 1361 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true, playback-smoke:true | 6305.4 ms | 4.758x | 100,302,248 B (~95.7 MB) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested Opus track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in vendored wasm core traps or exceeds suite timeout; Opus encode not declared reliable |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

Both winners run on the same backend class: Chrome 149 WebCodecs `VideoEncoder`/`AudioEncoder` on an Apple M1 Max (ANGLE Metal). mediabunny's configUsed records `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. remotion-webcodecs records `backend:"webcodecs"`, `pipeline:"streaming-backpressure"`, `pixelBackend:"offscreencanvas-2d"`, `worker:"convert=main-thread"`. The codec work is therefore equivalent in principle; the difference is pipeline scheduling and how much work lands on the main thread.

VP9 is a software-preferred encode in this adapter. mediabunny's `buildVideoOptions` (src/engines/mediabunny/adapter.ts:622-626) puts VP9 in `SOFTWARE_PREFERRED_ENCODE`, so it probes `['prefer-software','no-preference']` via `mb.canEncodeVideo` (adapter.ts:638-640) before committing — hardware VP9 encoders are scarce and picky, so this avoids a doomed hardware path. The real transcode is a genuine `Conversion.init` + `conversion.execute()` (src/engines/mediabunny/adapter.ts:848-855), with audio handled by `buildAudioOptions` (adapter.ts:672) re-encoding AAC -> Opus (the copy fast-path is intentionally skipped because the codec changes). This is a real two-track re-encode, not a remux.

The decisive mechanism for the performance gap is main-thread occupancy. mediabunny's streaming-lockstep pipeline produced only 1361 ms of longtasks while remotion-webcodecs's main-thread `convert` plus offscreencanvas-2d pixel path produced 19963 ms of longtasks — a 14.67x difference. remotion-webcodecs's configUsed explicitly notes `worker:"convert=main-thread"`, which is exactly why its long-task budget is an order of magnitude worse: the whole convert loop, including its 2D-canvas pixel transfer, blocks the main thread. That same overhead shows up as ~95.7 MB peak memory (mediabunny did not sample peakMemory, n=0) and the slower wall/throughput/encodeFps. Net: same correctness, but mediabunny finishes the 30 s clip at 6.562x realtime (196.87 encode fps) versus 4.758x realtime (142.73 encode fps).

On the oracle measurements: there is no committed golden for the VP9/WebM output (goldens exist only for the H.264 source `h264_1080p_30s.mp4.*` and for native VP9 fixtures, not for this transcode's exact output), so ssim-psnr fell to the reference-source branch (src/core/oracles.ts:1697-1738): decode the H.264 source in-browser, downscale to the candidate resolution, and SSIM against the engine's WebM output frames. mediabunny scored ssimMean 0.99999870 / ssimMin 0.99999672 over 12 frame pairs; remotion-webcodecs scored ssimMean 0.99999998 / ssimMin 0.99999997 over 12 pairs. Both are far above the default 0.99 threshold, but both report exactFrames=0 ("digest proxy: 0/12 exact"), so this is a perceptual proxy, not a bit-exact gate. remotion-webcodecs's SSIM is marginally higher, but a near-1.0 perceptual-proxy delta at the 6th-7th decimal is not a meaningful correctness advantage and does not outweigh a 1.38x-14.67x performance loss. playback-smoke (a real `<video>` plays a few frames of the output) passed for both, confirming both produced a genuinely demuxable/decodable WebM.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, lost): genuinely transcodes (real WebCodecs convert, transcode:true at src/engines/remotion-webcodecs/adapter.ts:244, transcode() at :521) and its SSIM is fractionally higher, but it runs convert on the main thread, costing 19963 ms longtasks (14.67x mediabunny), ~95.7 MB peak memory, 6305.4 ms wall (1.38x slower), 4.758x throughput and 142.73 encodeFps (both 1.38x worse). Correctness tie -> loses on performance.
- **platform@chrome-149** (NA_ENGINE, honest): its only encode path is `<video>->canvas->MediaRecorder`, which is video-only and silently drops audio; it cannot emit the required Opus audio track. This is an honest capability NA, not an under-declaration — MediaRecorder canvas capture genuinely has no audio source here.
- **ffmpeg.wasm@0.12.15** (NA_ENGINE, honest): libopus in the vendored wasm core traps or exceeds the suite timeout, so Opus encode is not declared a reliable path. Honest NA given the WebM container mandates Opus audio; the wasm core cannot produce it within budget.
- **web-demuxer@4.0.0** (NA_ENGINE, honest): does not declare the `transcode` operation — it is a demuxer only, no encoder.
- **mp4box@2.3.0** (NA_ENGINE, honest): does not declare `transcode` — MP4 box parser/muxer, no codec encode.
- **remotion-media-parser@4.0.479** (NA_ENGINE, honest): does not declare `transcode` — a parser, not an encoder.

## Anti-cheat validation

- Scenario: src/scenarios/transcode/index.ts:87-98 (`id: 'h264_to_vp9_webm'`), asset `h264_1080p_30s.mp4`, opts `{container:'webm', video:{codec:'vp9'}, audio:{codec:'opus'}}`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB, real H.264/AAC MP4 (not synthetic/empty/mock). Goldens for the source exist (h264_1080p_30s.mp4.{frames,packets,ssim,meta}.json); no golden for the VP9 output, which is expected for a transcode and is why the oracle uses the reference-source branch.
- Winner adapter: src/engines/mediabunny/adapter.ts:1271 transcode() -> buildVideoOptions (:542, probes VP9 software encode :622-640) + buildAudioOptions (:672, AAC->Opus re-encode) -> runConversion (:842) calls real `Conversion.init` (:848) and `conversion.execute()` (:855). No canned output, no input->output copy, no short-circuit to a golden, no swallowed errors — failures throw (e.g. :650 unencodable-codec, :861 no output buffer).
- Oracle: src/core/oracles.ts:1688 ssimPsnr. Reference-source path (:1697-1738) decodes the real source and SSIMs against the engine's actual decoded output frames; default ssimMin 0.99 (oracles.ts:157). The measurements (12 frame pairs, ssimMin ~0.99999672, exactFrames=0) are physically plausible for a real H.264->VP9 transcode. playback-smoke independently confirms a decodable WebM.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the win is real, but the gating correctness oracle is a perceptual SSIM proxy against a re-decoded reference source with exactFrames=0 (no bit-exact or golden-packet check on the VP9/Opus output), backed up only by a smoke test. The PASS is genuine but not a strong correctness gate.
- Cached note: mediabunny's result is cached==true ("cached previous PASS result"), so the benchmark numbers were reused, not freshly re-run — staleness risk on the exact metric magnitudes (the ordering is consistent across four metrics, so the winner choice is robust).

## Confidence & caveats

Medium confidence. The winner is unambiguous on direction (mediabunny leads on wall, throughput, encodeFps, and longtasks simultaneously), and both PASS engines are real implementations against a real 31 MB fixture. Caveats: (1) both PASS results are n=1 with mad=0 and cached==true, so the exact ratios are single-sample and possibly stale; (2) the gating oracle is a perceptual reference-source SSIM proxy (exactFrames=0) plus smoke, i.e. WEAK-GATE, so neither engine is proven bit-exact; (3) remotion-webcodecs has a hair-higher SSIM but the difference is at the 6th decimal and not decision-relevant; (4) mediabunny did not sample peakMemory (n=0), so memory cannot be compared directly though remotion-webcodecs's ~95.7 MB and 14.67x longtasks strongly imply mediabunny is the lighter path.
