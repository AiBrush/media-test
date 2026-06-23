# transcode/h264_bitrate_2mbps

family: transcode | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real) | primaryMetric: wall | passCount: 3 of 7

Operation: re-encode H.264-in-MP4 (AAC audio) to H.264-in-MP4 with a **target video bitrate of 2,000,000 bps** (an ABR quality rung). Source: `h264_1080p_30s.mp4`, 1080p ~30 fps, ~30 s. Scenario def: `src/scenarios/transcode/index.ts:254-266`; `opts.video.bitrate = 2_000_000`; tolerances loosened to `ssimMin 0.95 / psnrMinDb 34` because "lower floors acknowledge intended quality loss."

## Verdict

**Nominal best framework: remotion-webcodecs@4.0.479** — but this win is **CONTESTED and an artifact** (see anti-cheat). Three engines PASS: `remotion-webcodecs`, `mediabunny`, `ffmpeg-wasm`.

Decisive factor (by the literal correctness ladder): remotion-webcodecs is the only PASS with **exactFrames=12/12, SSIM=1, PSNR=∞** (digest-identical decoded frames), which outranks the digest-proxy SSIM (exactFrames=0) of the other two on the strength ladder. **However**, that byte-identity is achieved because remotion-webcodecs **silently dropped the 2 Mbps bitrate request and convertMedia copied the H.264 track verbatim** (no re-encode). The two engines that actually performed the requested 2 Mbps re-encode are `mediabunny` and `ffmpeg-wasm`; both correctly score exactFrames=0 / SSIM≈0.99997 — the physically-correct signature of a lossy ABR re-encode.

Among engines that genuinely performed the operation, **mediabunny** is the strongest: real WebCodecs re-encode at 2 Mbps with the best longtask profile (179 ms) and 2760 ms wall. remotion-webcodecs' performance edge (1.32x faster wall, 1.32x encodeFps) over mediabunny is not a like-for-like comparison because it skipped the encode.

Margin (nominal winner vs runner-up mediabunny): wall 2092.7 ms vs 2760.5 ms = **1.32x faster**; encodeFps 430.1 vs 326.0 = **1.32x**; throughputRealtime 14.34x vs 10.87x = **1.32x**. But longtasks **3675 ms vs 179 ms = 20.5x WORSE** for remotion. All metrics n=1, mad=0 (single sample) → weak statistical evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (12/12 exact, SSIM=1, PSNR=∞); playback-smoke:true | 2092.72 ms | 14.34x | 0 (not measured) | 3675 ms | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (0/12 exact, SSIMmin 0.99997); playback-smoke:true | 2760.55 ms | 10.87x | 0 (not measured) | 179 ms | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (0/12 exact, SSIMmin 0.99996); playback-smoke:true | 70367.17 ms | 0.43x | 0 (not measured) | 13168 ms | cached previous PASS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

(peakMemory and decodeFps have n=0 samples for every engine — not captured in this run.)

## Why the winner wins (deep technical)

The scenario is an mp4→mp4, h264→h264 re-encode with `video.bitrate = 2_000_000` and no resize/rotate/fps change. The ssim-psnr oracle (`src/core/oracles.ts:1688`) loads the golden keyed by the **SOURCE** asset id (`loadGolden('h264_1080p_30s.mp4')` → `fixtures/golden/h264_1080p_30s.mp4.{frames,ssim}.json`), so `haveGolden` is true and it runs the committed-golden branch (`oracles.ts:1741-1833`). It re-decodes each engine's output with the platform decoder, normalizes to tight straight-alpha RGBA, SHA-256s each frame, and compares index-by-index to the source golden. A digest match → exactFrames++ and SSIM=1; otherwise it falls back to downsampled-luma-signature SSIM. When all pairs are digest-identical it reports PSNR=∞ (`oracles.ts:1803-1809`).

remotion-webcodecs scored 12/12 digest-exact (`ssimMean 1, ssimMin 1`). Mechanistically this is because its `transcode()` adapter (`src/engines/remotion-webcodecs/adapter.ts:521-577`) **never reads or forwards `videoSpec.bitrate`** — it maps only container, videoCodec, resize, rotate, audioCodec, onAudioTrack, then calls `convertMedia` (`adapter.ts:615-627`) with `videoCodec='h264'` and no resize/rotate. For an mp4→mp4 h264→h264 request with no transform, `@remotion/webcodecs` convertMedia takes its **copy-track** path (no decode/encode), so the output video samples are the *source* encoded samples. Re-decoding them yields pixels byte-identical to the source golden → PSNR=∞. The configUsed backend is `webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure`, `writer: bufferWriter`, `coopCoep` not required. The "win" is therefore a consequence of **not transcoding** — the 2 Mbps quality knob was discarded.

By contrast, the two engines that honored the bitrate produced genuinely re-encoded, slightly different pixels:
- ffmpeg-wasm forwards the target into x264 as a constrained-quality cap: `args.push('-b:v', String(v.bitrate), '-crf', crf)` (`src/engines/ffmpeg-wasm/adapter.ts:2423-2424`). A real lossy 2 Mbps re-encode → exactFrames=0 but SSIMmin 0.99996 (≥0.95 floor) → PASS.
- mediabunny sets `opts.bitrate = v.bitrate` (`src/engines/mediabunny/adapter.ts:610-614`) on the Conversion video block with `codec='avc'`, probes `canEncodeVideo`, and re-encodes via WebCodecs (hardware-preferred). Real re-encode → exactFrames=0, SSIMmin 0.99997 → PASS, and it does so in 2760 ms with only 179 ms of long tasks and encodeFps 326.

So on the literal oracle ladder remotion-webcodecs ranks first (digest-exact > proxy-SSIM), but the only reason it is digest-exact is that it skipped the work the scenario asked for. The oracle has no output-bitrate or output-byte-size check, so it cannot distinguish "perfect transcode" from "copied the source." This makes the gate weak for this specific scenario.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, genuinely re-encoded at 2 Mbps (exactFrames=0, SSIMmin 0.99997). "Lost" only on the digest-exact ladder, which here rewards the copy path it (correctly) did not take. On real performance it BEATS the winner on longtasks 179 ms vs 3675 ms (20.5x better) and is only 1.32x slower wall — arguably the true best engine for this operation.
- **ffmpeg.wasm@0.12.15** — PASS, genuine two-pass-capable x264 re-encode honoring `-b:v 2000000`. Correctness is real (SSIMmin 0.99996) but performance is far behind: wall 70367 ms (25.5x slower than mediabunny, 33.6x slower than remotion), throughput 0.43x realtime (sub-realtime), 13168 ms longtasks — single-thread wasm x264 vs native WebCodecs.
- **platform@chrome-149** — NA_ENGINE (honest). configUsed encode path is `<video>→canvas→MediaRecorder`; that pipeline cannot preserve/copy the source AAC audio, so it declines a transcode whose source carries audio. Honest capability gap, not under-declared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — MP4Box.js is a (de)muxer, no encoder.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'transcode'. Honest — it is a demux-only wasm wrapper.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'transcode'. Honest — media-parser is parse/demux only; encoding lives in @remotion/webcodecs.

## Anti-cheat validation

- **Scenario**: `src/scenarios/transcode/index.ts:254-266` (`id: 'h264_bitrate_2mbps'`, `asset: 'h264_1080p_30s.mp4'`, `opts.video.bitrate = 2_000_000`, tolerances ssimMin 0.95 / psnrMinDb 34, notes "Re-encode at 2 Mbps").
- **Fixture**: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real 1080p H.264/AAC clip, not synthetic/mock. Committed source golden present: `fixtures/golden/h264_1080p_30s.mp4.{frames,ssim,meta,packets}.json`.
- **Winner adapter**: `src/engines/remotion-webcodecs/adapter.ts:521-577` (transcode) → `:615-627` (convertMedia). The library IS genuinely called (no canned output, no short-circuit to golden, no error-swallowing). BUT `videoSpec.bitrate` is read nowhere in `transcode()` or in `ensureSupportedTranscodeRequest` (`adapter.ts:2204-2262`): the 2 Mbps request is **silently dropped**, and with same codec + no transform convertMedia copies the H.264 track instead of re-encoding.
- **Oracle**: `src/core/oracles.ts:1688` (ssimPsnr), committed-golden branch `:1741-1833`, digest-exact short-circuit `:1803-1809`. The comparison is REAL (decodes output, SHA-256 vs source golden) and the proxy-SSIM/luma-sig path is sound. Measurements are physically plausible (12 paired frames; SSIM≈0.99996-1.0). The weakness is scenario-specific: the oracle compares output to the **source** and has **no bitrate/byte-size gate**, so a track-copy that ignores the bitrate knob scores PSNR=∞ and "wins."
- **Verdict: WEAK-GATE.** All three PASSes are real (real fixture, real library calls, meaningful pixel comparison). But for THIS scenario the gate cannot detect that the nominal winner ignored the 2 Mbps target and copied the source; digest-exactness rewards the engine that did the least work. The honest correctness winner is whichever engine actually re-encoded at 2 Mbps (mediabunny / ffmpeg-wasm), and the suite should add an output-bitrate/byte-size oracle for bitrate-target scenarios.
- **Cached note**: ALL three PASS results have `cached: true` ("cached previous PASS result"). Evidence was reused, not re-run this session → staleness risk; numbers reflect prior runs (remotion startedAt 16:49, mediabunny 16:34, ffmpeg 16:58 on 2026-06-22).

## Confidence & caveats

- Confidence: **medium**. Code paths are unambiguous (bitrate is provably not forwarded in the remotion adapter; mediabunny/ffmpeg provably forward it), and the oracle math is clear. Lowered from high because: (1) all results are cached/n=1/mad=0 — single-sample timings, weak performance evidence; (2) I inferred convertMedia's copy-track decision from the adapter inputs and the digest-exact outcome rather than instrumenting the library at runtime; (3) peakMemory/decodeFps were not captured (n=0).
- The leaderboard label "best = remotion-webcodecs" follows the literal correctness ladder but is misleading for this scenario; the deep-technical and anti-cheat sections are the load-bearing finding. If correctness is judged on "did it perform the requested 2 Mbps re-encode," mediabunny is the true winner (real encode + best longtask/wall profile among genuine transcoders).
