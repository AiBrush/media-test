# performance/op-sweep-transcode-webm

- **Family:** performance
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (BIG_READ_GOLDEN; 31,258,790 bytes / ~31 MB; H.264 + AAC, 1080p, ~30 s)
- **Operation:** transcode MP4(H.264/AAC) → WebM(VP9/Opus) downscaled to 320×180
- **Primary metric:** `encodeFps`
- **passCount:** 2 of 7 (mediabunny, remotion-webcodecs)

## Verdict

- **Best framework:** `mediabunny@1.48.0` (env.engineId `mediabunny`)
- **Contested:** YES — two engines PASS (mediabunny, remotion-webcodecs) with an identical oracle set.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both pass the same three oracles — `ssim-psnr`, `property-invariant`, `playback-smoke` — at effectively identical SSIM and both with `exactFrames==0`, i.e. perceptual-proxy strength only). The tie therefore breaks on the primary metric `encodeFps`.
- **Margin over runner-up (remotion-webcodecs):** mediabunny **512.02 encodeFps vs 299.72 = 1.71x faster encode**; **wall 1757.73 ms vs 3002.85 ms = 1.71x faster**; **throughputRealtime 17.07x vs 9.99x = 1.71x higher**. (Both samples are `n==1, mad==0, cached==true` — see caveats.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:✔ property-invariant:✔ playback-smoke:✔ | 1757.73 | 17.07 | n/a (not in bench) | n/a | encodeFps 512.02 |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:✔ property-invariant:✔ playback-smoke:✔ | 3002.85 | 9.99 | n/a (not in bench) | n/a | encodeFps 299.72; cached previous PASS |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode NA: libopus encode in vendored wasm core traps or exceeds timeout; Opus encode not declared as a reliable transcode path |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (parser-only, no encode) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (demux-only) |

Note: this scenario's bench block carries only `encodeFps`, `framesPerSec`, `throughputRealtime`, and `wall`. `peakMemory` and `longtasks` are not collected for this case, so those columns are n/a for every engine.

## Why the winner wins (deep technical)

This is a heavy cross-codec, cross-container, downscaling re-encode: every frame of a ~30 s 1080p H.264/AAC clip must be decoded, scaled 1080p→320×180, VP9-re-encoded, the audio Opus-re-encoded, and the result muxed into WebM. Two engines complete it correctly; both drive Chrome's WebCodecs `VideoEncoder`/`AudioEncoder` with `backend:"webcodecs"` (per `env.configUsed`), so the raw codec horsepower is the same. The win is in pipeline architecture and encode-config choices, not codec choice.

**mediabunny's path (the winner).** `transcode()` (`src/engines/mediabunny/adapter.ts:1271`) builds a single `Conversion` over one `Input`/`Output` pair, calling `buildVideoOptions` for VP9@320×180 and `buildAudioOptions` for Opus, then runs it through `runConversion` (`src/engines/mediabunny/adapter.ts:842`), which is `Conversion.init()` + `conversion.execute()` and reads the bytes out of a real `BufferTarget` (`adapter.ts:855-868`). Two mechanistic advantages show up in the numbers:

1. **Encoder config tuned for small-box VP9.** The adapter explicitly avoids the VP9 QUALITY_HIGH preset, which "collapses to a hardware-rejected ~120 kbps for VP9@320×180" (commented at the VP9 bitrate logic and at `adapter.ts:609`, `:651`). By computing a sane bitrate and pre-validating with `VideoEncoder.isConfigSupported` before committing, it never stalls on a rejected mid-transcode config. The 1080p→180p downscale to a 320×180 VP9 target is exactly the regime where a bad rate target either traps or silently degrades; mediabunny side-steps it.
2. **`streaming-lockstep` pipeline (`configUsed.pipeline`).** mediabunny's Conversion runs read→decode→encode→mux in lockstep with an `auto` queue depth and a 4-entry `canvasPool` (`canvasPoolSize:4`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`), keeping VRAM constant and the encoder queue saturated. The measured effect: **encodeFps 512.02**, **wall 1757.73 ms**, **throughputRealtime 17.07x realtime** on the 30 s source.

**Oracle evidence (real numbers from the shard).** mediabunny passes `ssim-psnr` with `ssimMean 0.99970`, `ssimMin 0.99968` over `pairs:12`, `exactFrames:0`. The `exactFrames:0` and detail string "PSNR via golden pixels unavailable (digest proxy)" confirm this used the §5.2 reference-source fallback (`ssimVsReferenceSource`, `src/core/oracles.ts:1842`): the source is decoded in-browser by the platform engine, downscaled to the candidate's 320×180, and SSIM'd frame-by-frame — a genuine perceptual comparison, not a golden short-circuit. `property-invariant` (transcode-output-metadata, `oracles.ts:3640`) re-probes the output via the reference engine and confirms container `webm`, `videoTracks:1`, `audioTracks:1`, and `durationDeltaSec 0.02 ≤ 0.15` tolerance — proving the Opus audio track survived (the exact thing the platform engine fails on). `playback-smoke` confirms `<video>` actually plays the output.

**Why mediabunny beats remotion-webcodecs specifically.** remotion-webcodecs also PASSes with near-identical SSIM (`ssimMean 0.99971`, `ssimMin 0.99970`, `exactFrames:0`) and the same track shape, so correctness is a wash. But its `convertMedia` driver runs `convert=main-thread` (`configUsed.worker`) with a `streaming-backpressure` pipeline and `queueDepth:"waitForQueueToBeLessThan"`, and notably leaves the VP9 codec to convertMedia's container-default re-encode handler rather than a small-box-tuned config. The result is **half the encode rate** (299.72 vs 512.02 fps) and **1.71x the wall time** (3002.85 vs 1757.73 ms). Same backend, same WebCodecs encoder — mediabunny's lockstep scheduling + canvas pool + explicit VP9 rate target extract ~1.7x more throughput for this 320×180 VP9 box.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct output (SSIM 0.99971, 1 video + 1 audio webm track) but **1.71x slower** — encodeFps 299.72 vs 512.02, wall 3002.85 ms vs 1757.73, throughputRealtime 9.99x vs 17.07x. Main-thread convert + default-handler VP9 re-encode rather than a tuned small-box config. Also `cached:true`.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** honest NA. "libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path." The scenario mandates an Opus audio track, and single-thread wasm Opus encode is unreliable here — a genuine capability gap, not under-declaration.
- **platform@chrome-149 (NA_ENGINE):** honest NA. Its only encode path is `<video>→canvas→MediaRecorder`, which is video-only and "drops audio; cannot produce the requested audio track." The scenario requires `audio:{codec:'opus'}`, so the platform path structurally cannot satisfy `property-invariant` (audioTracks would be 0). Correct to decline rather than emit a video-only file.
- **mp4box@2.3.0 (NA_ENGINE):** honest — "engine does not declare operation 'transcode'." mp4box is an MP4 box parser/muxer, not an encoder; no decode→encode capability.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest — parser only; "does not declare operation 'transcode'." No encoder in the media-parser package.
- **web-demuxer@4.0.0 (NA_ENGINE):** honest — demux-only; "does not declare operation 'transcode'." No encode path.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/op-sweep.ts:102-118` (`sweepTranscode`, id at `:103`). Input is `BIG_READ_GOLDEN` = `h264_1080p_30s.mp4` (`src/scenarios/performance/_shared.ts:71`). Output target `CONVERT_320x180` = WebM/VP9/Opus @320×180 (`_shared.ts:102-106`), invariant `transcode-output-metadata`, tolerances `ssimMin:0.97, psnrMinDb:36, durationToleranceSec:0.15` (`_shared.ts:119`, scenario `:97-100`).
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4`, 31,258,790 bytes — a real ~31 MB 1080p H.264/AAC media file, not synthetic/empty/mock.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1271` (`transcode`) → `:842` (`runConversion`) calls real `mb.Conversion.init()` + `conversion.execute()` and reads output from a real `BufferTarget.buffer` (`:855-868`). No canned bytes, no input→output copy, no golden short-circuit, no swallowed error reported as success (invalid conversions throw at `:851`).
- **Oracle is meaningful:** `ssim-psnr` (`src/core/oracles.ts:1688`) with no committed golden takes the §5.2 reference-source path `ssimVsReferenceSource` (`:1842`): decodes the real source in-browser, downscales to candidate dims, and computes per-frame SSIM. `property-invariant` transcode-output-metadata (`:3640`) re-probes the output and checks container/track-count/duration. Measurements are physically plausible: 12 paired frames, SSIM ~0.9997 (high but not a fixed 1.0 — consistent with a real 1080p→180p downscale), duration delta 0.02 s within 0.15 s tolerance.
- **WEAK-GATE consideration:** the correctness gate here is a perceptual proxy, not bit-exact. `exactFrames:0` for both engines and the detail "PSNR via golden pixels unavailable" mean there is no decoded-frames-bitexact / golden-packets gate — only SSIM (with a loosened 0.97 floor for the heavy downscale) plus a metadata-shape invariant plus playback-smoke. The PASS is real and the floor was cleared with large margin (0.9997 ≫ 0.97), but on the correctness ladder this sits at perceptual-proxy strength, below structural/bit-exact gates.
- **Cached note:** BOTH PASS engines have `cached:true` (mediabunny "cached previous PASS result", `durationMs:9986`; remotion-webcodecs same, `durationMs:15461`). The reported encodeFps/wall numbers were reused from a prior run, not re-measured this run — staleness risk on the exact margin, though the relative ordering (mediabunny ~1.7x faster) is consistent and large.

**validationVerdict: WEAK-GATE.** Real fixture, real mediabunny Conversion implementation, real reference-source SSIM oracle — but the strongest gate available is a perceptual SSIM proxy (exactFrames==0) plus a metadata-shape invariant, not a bit-exact or golden-packet comparison. The PASS is trustworthy; the gate is not maximally strict.

## Confidence & caveats

- **Confidence: medium.** The correctness tie and the 1.71x performance margin are unambiguous from the shard, and the winner's code path is verified genuine. Two caveats pull confidence down from high: (1) both winning results are `cached:true` with `n==1, mad==0` — single-sample, reused timings, so the absolute encodeFps/wall numbers carry staleness and sampling risk (the ratio is large enough to survive normal jitter, but it is one data point each); (2) the gate is a perceptual proxy (WEAK-GATE), so "best transcode" here means fastest-among-the-perceptually-correct, not bit-exact-verified.
- The scenario notes describe VP9/Opus, matching `CONVERT_320x180`; the shard's `property-invariant` confirms a 2-track WebM output, consistent with the declared shape.
- `peakMemory`/`longtasks` are not in this case's bench, so the perf comparison rests on encodeFps (primary), wall, and throughputRealtime — all three agree on mediabunny by the same 1.71x factor.
