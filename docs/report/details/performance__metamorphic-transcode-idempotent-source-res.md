# performance/metamorphic-transcode-idempotent-source-res

family: performance | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AVC 1920x1080 in MP4) | primaryMetric: framesPerSec | passCount: 2 of 7

This scenario is a metamorphic/idempotent transcode: convert `h264_1080p_30s.mp4` (H.264 + AAC in MP4) to **WebM / VP9 / Opus** at the SOURCE resolution 1920x1080 — a 1:1 geometry no-op intended to catch 1:1 resampler distortion. The codec/audio is genuinely re-encoded (H.264->VP9, AAC->Opus), only the geometry is identity. Gated by `ssim-psnr` (tight floor `ssimMin: 0.99`) + `playback-smoke`. Ranked by `framesPerSec`.

## Verdict

- **Best framework: mediabunny@1.48.0** (PASS).
- **CONTESTED**: 2 engines PASS (mediabunny, remotion-webcodecs); the other 5 are NA_ENGINE.
- **Decisive factor: throughput.** Both PASS engines satisfy the identical oracle set at identical correctness strength (perceptual SSIM ~1.0000, `exactFrames=0` for both — neither achieves bit-exact, so correctness is a tie). The tiebreak falls to the primary metric `framesPerSec`.
- **Margin over runner-up:** mediabunny **139.64 fps** vs remotion-webcodecs **136.36 fps** = **1.024x faster encode**; wall **6444.96 ms** vs **6599.95 ms** = **1.024x lower wall**. The margin is real but very thin, and on **n=1, mad=0** samples (single timed run each, both `cached`) — weak statistical evidence. See caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:pass, playback-smoke:pass | 6444.96 | n/a (framesPerSec=139.64) | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass, playback-smoke:pass | 6599.95 | n/a (framesPerSec=136.36) | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | libopus encode in the vendored wasm core traps/exceeds timeout; Opus encode not declared a reliable transcode path |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Bench note: this scenario declares metrics `framesPerSec / encodeFps / wall` only (no throughputRealtime/peakMemory/longtasks in the shard `bench` blocks). For both PASS engines `framesPerSec == encodeFps` (single video re-encode pass). All samples are `n=1, warmup=1, mad=0, p95==median`.

## Why the winner wins (deep technical)

Both PASS engines drive the **WebCodecs `VideoEncoder`** (`env.configUsed.backend: "webcodecs"`) on an Apple M1 Max via ANGLE Metal. For the target codec **VP9**, hardware encoders are scarce/picky, so both correctly fall to a software-preferred encode path. mediabunny's `env.configUsed.hwAccel` is `"prefer-hardware"` but its codec selector explicitly forces **software for VP9/VP8** — `SOFTWARE_PREFERRED_ENCODE = new Set(['vp9','vp8'])` at `src/engines/mediabunny/adapter.ts:499`, with the acceleration order resolved to `['prefer-software','no-preference']` at `adapter.ts:622-626` and validated up front via `mb.canEncodeVideo(...isConfigSupported)` at `adapter.ts:638-645`. This means neither engine is paying a hardware-VP9 penalty; both are doing libvpx-style software VP9 encode behind WebCodecs.

The actual conversion runs through mediabunny's first-class `Conversion` API: `mb.Conversion.init(opts)` then `await conversion.execute()` (`src/engines/mediabunny/adapter.ts:848-855`), with the geometry being identity (1920x1080 in -> 1920x1080 out), so the only work is decode H.264 -> re-encode VP9 + transcode AAC -> Opus + mux WebM. mediabunny streams this read->decode->encode->mux in its `streaming-lockstep` pipeline (`env.configUsed.pipeline`) with a `CanvasSink` ring-buffer (`canvasPoolSize: 4`) keeping VRAM flat. remotion-webcodecs runs the equivalent work through `wc.convertMedia({ container, videoCodec, audioCodec, resize, ... })` at `src/engines/remotion-webcodecs/adapter.ts:615-627`, with its pixel transform stage limited to **OffscreenCanvas 2D** (`env.configUsed.pixelBackend: "offscreencanvas-2d"`) and a `bufferWriter` for in-memory output.

The mechanistic edge: at a 1:1 geometry no-op, the pixel-transform stage is doing nothing useful, yet remotion still routes frames through its OffscreenCanvas 2D resize plumbing (`buildResize(videoSpec)` at `adapter.ts:541`, then `resize` passed to `convertMedia`), while mediabunny's Conversion can keep frames on its `VideoSample.copyTo(RGBA)>canvas` pool and feed the encoder more directly. That translates into the measured **139.64 vs 136.36 fps** (1.024x). Both are decoding/encoding the same ~12-frame-sampled clip's full 30 s of video; the dominant cost is software VP9 encode, where the two pipelines are nearly identical — hence the thin margin rather than a blowout.

Correctness is a genuine tie: the gating `ssim-psnr` oracle compares the platform-decoded WebM output frames against the committed golden luma signatures (`src/core/oracles.ts:1748-1797`), reporting `pairs:12, exactFrames:0` for both engines. mediabunny scores `ssimMean 0.9999997, ssimMin 0.9999995`; remotion scores `ssimMean 0.99999998, ssimMin 0.99999997`. Both clear the tight `ssimMin >= 0.99` floor by a wide margin, confirming neither engine distorts at 1:1. `exactFrames=0` means this is a **perceptual proxy** pass (digest equality not achieved — expected, since H.264->VP9 re-encode is not bit-exact), so under the correctness ladder this sits at "perceptual proxy", which is why the contest correctly drops to the performance tiebreak. `playback-smoke` passed for both (`<video> played a few frames of the output`), confirming the WebM is actually playable, not just decodable in the oracle harness.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost):** correct and playable, but **1.024x slower** on both framesPerSec (136.36 vs 139.64) and wall (6599.95 vs 6444.96 ms). Same software-VP9 WebCodecs path; the small deficit traces to its OffscreenCanvas-2D-mediated frame transform stage being exercised even for a 1:1 no-op (`adapter.ts:541,620`). Marginally higher reported SSIM but that is not a tiebreaker once both clear the floor with `exactFrames=0`.
- **platform@chrome-149 (NA_ENGINE):** honest NA. Its only encode route is `<video>->canvas->MediaRecorder`, which is video-only and **drops the audio track**; the scenario requires an Opus audio track, so it cannot satisfy the request. Genuine runtime limitation, not an under-declared capability.
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** honest NA. The vendored wasm core's **libopus encoder traps or exceeds the suite timeout**, so Opus encode is not declared a reliable transcode path. Plausible given known ffmpeg.wasm Opus build issues; not a cheat.
- **web-demuxer@4.0.0 (NA_ENGINE):** does not declare the `transcode` operation at all — it is a demuxer. Honest capability boundary.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** parser/probe only; does not declare `transcode`. Honest.
- **mp4box@2.3.0 (NA_ENGINE):** ISOBMFF box mux/demux only, no encoder; does not declare `transcode`. Honest.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/metamorphic.ts:50-74` (`id: 'performance/metamorphic-transcode-idempotent-source-res'`), op `transcode`, input `h264_1080p_30s.mp4`, options `{container:'webm', video:{codec:'vp9',width:1920,height:1080}, audio:{codec:'opus'}}` (`SOURCE_RES_CONVERT` at lines 44-48), tolerances `{ssimMin:0.99, psnrMinDb:40}`.
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4`, 31 MB, real H.264 1080p MP4 — not synthetic/empty/mock.
- **Winner adapter genuinely implements the op:** `src/engines/mediabunny/adapter.ts:1271` (`async transcode`), building real `ConversionVideoOptions`/`ConversionAudioOptions` and running `mb.Conversion.init(opts)` + `await conversion.execute()` (`adapter.ts:848-855`). Output bytes come from a real `BufferTarget` buffer (`adapter.ts:856-868`). It does NOT copy input->output, return canned bytes, or short-circuit to a golden; it probes encodability with `mb.canEncodeVideo` before committing (`adapter.ts:638-645`) and throws on genuine inability rather than faking success (`adapter.ts:647-655`).
- **Gating oracle is real:** `ssim-psnr` in `src/core/oracles.ts:1688` re-decodes the engine's WebM output via the platform decoder and compares against committed golden luma signatures (`oracles.ts:1748-1797`); `pairs:12, exactFrames:0` and `ssimMin ~1.0000` are physically plausible for a 1:1 H.264->VP9 re-encode (perceptually identical, not bit-identical). The floor `ssimMin>=0.99` is tight enough to catch resampler distortion (per scenario notes a wrong frame scores ~0.84). `playback-smoke` (`oracles.ts:1574`) actually plays the output `<video>`.
- **Cached note:** **both PASS engines have `cached:true`** ("cached previous PASS result"). The winning evidence was REUSED, not re-run in this batch. The margin is also n=1/mad=0. This is a mild staleness/robustness risk but the underlying numbers and oracle outcomes are consistent and plausible.
- **Verdict: WEAK-GATE.** The implementation, fixture, and oracle are all real (would be REAL on those axes), but the gating oracle for this transcode is a **perceptual SSIM proxy with `exactFrames=0`** (no bit-exact/golden-pixel gate available — golden frames pending per scenario notes line 11-12), i.e. the correctness gate is the weaker perceptual rung, not a bit-exact one. Combined with cached-only, n=1 evidence, the PASS is real but not strong.

## Confidence & caveats

- **Confidence: medium.** The winner choice is well-founded (identical oracle pass + faster on the declared primary metric and wall), but the **margin is only 1.024x** and rests on **n=1, mad=0, cached** samples for both engines — a re-run could plausibly flip the order. If a fresh, multi-sample run is needed for a tiebreak this thin, clear `.browser-cache` and re-run (per the launcher seeding caveat).
- The correctness gate is a perceptual SSIM proxy (`exactFrames=0`); once golden frames are baked (scenario notes lines 10-12) this would gate harder and could re-rank on true frame fidelity rather than throughput.
- Bench fields peakMemory/longtasks/throughputRealtime are absent for this scenario (not in its declared metrics), so the tiebreak legitimately used framesPerSec + wall only.
