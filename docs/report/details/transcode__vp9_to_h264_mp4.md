# transcode/vp9_to_h264_mp4

family: transcode | fixture asset: `vp9_1080p_10s.webm` (9.29 MB, VP9 1080p video + Opus audio, WebM/Matroska) | primaryMetric: wall (median ms) | passCount: 3 / 7

Operation: re-encode VP9-in-WebM → H.264-in-MP4, audio Opus → AAC (`opts: {container:'mp4', video:{codec:'h264'}, audio:{codec:'aac'}}`). SSIM floor 0.98, PSNR floor 38 dB (`src/scenarios/transcode/index.ts:138-148`).

## Verdict

**Best framework: remotion-webcodecs@4.0.479.** CONTESTED — three engines PASS (remotion-webcodecs, mediabunny, ffmpeg.wasm) and all three satisfy the identical oracle pair (`ssim-psnr` + `playback-smoke`) at indistinguishable correctness (SSIM min ≈ 0.99999 for all three). Correctness being a tie, the decision falls to **performance**, where remotion-webcodecs is decisive.

Decisive factor: **wall-clock / encode throughput.** remotion-webcodecs wall median 1291.18 ms vs mediabunny 1775.06 ms = **1.37x faster**; throughputRealtime 7.75x vs 5.64x = **1.37x higher**; encodeFps 232.3 vs 169.0 = **1.37x higher**. Both crush ffmpeg.wasm (29831.76 ms, 0.34x realtime, 10.1 encodeFps): remotion-webcodecs is **~23.1x faster wall** than the wasm engine. Margin over runner-up (mediabunny): **1.37x on every primary axis.** All samples are n==1 (mad=0, p95==median) so the spread is unmeasured — evidence strength is moderate, but the 1.37x gap is consistent across three independent metrics and the ffmpeg gap is an order of magnitude, so the ordering is robust.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | **PASS** | ssim-psnr:✓ playback-smoke:✓ | **1291.18** | **7.751** | not measured (n=0) | 2147 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ playback-smoke:✓ | 1775.06 | 5.638 | not measured (n=0) | 874 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:✓ playback-smoke:✓ | 29831.76 | 0.335 | not measured (n=0) | 2147 | cached previous PASS |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only, drops audio; cannot produce the requested AAC track |

encodeFps: remotion-webcodecs 232.35, mediabunny 169.01, ffmpeg.wasm 10.06. decodeFps unmeasured (n=0) for all. peakMemory unmeasured (n=0) for all — cannot tiebreak on memory.

## Why the winner wins (deep technical)

This is a **full re-encode** (VP9 and H.264 share no bitstream, so no copy/remux shortcut is possible: every frame must be decoded from VP9 and re-encoded to H.264, and Opus must be decoded and re-encoded to AAC). The performance therefore hinges entirely on the decode+encode pipeline backend.

remotion-webcodecs runs `convertMedia` over **native browser WebCodecs** with `hwAccel: "prefer-hardware(+software fallback)"` (`env.configUsed.backend == "webcodecs"`). On the M1 Max test host the VideoDecoder consumes VP9 and the VideoEncoder emits H.264 through the platform's hardware/optimized codec path, which is why it reaches **232 encodeFps** and **7.75x realtime** on a 10 s clip. The adapter path is `transcode()` at `src/engines/remotion-webcodecs/adapter.ts:521`, which maps the canonical `h264`/`aac` codecs via `canonicalToRemotionVideo`/`canonicalToRemotionAudio` (`adapter.ts:536-551`) and forwards to the shared `convert()` driver. `convert()` (`adapter.ts:580-639`) first does a header-only `parseMedia` probe to learn `durationInSeconds`/`fps` (`adapter.ts:600-606`) and feeds them to `convertMedia` as `expectedDurationInSeconds`/`expectedFrameRate` (`adapter.ts:625-626`) — this lets the muxer size the MP4 `moov` in a single pass instead of rewriting it, avoiding a second buffer copy. Output is collected in-memory via `bufferWriter` (`adapter.ts:624`) and returned as real bytes from `result.save()` (`adapter.ts:629-630`), with `result.remove()` freeing the buffer (`adapter.ts:632`). This is a genuine streaming-backpressure pipeline (`pipeline: "streaming-backpressure"`, `queueDepth: "waitForQueueToBeLessThan"`), not a fake.

mediabunny ALSO uses WebCodecs (`backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`) and lands close: 1775 ms / 5.64x / 169 encodeFps. The 1.37x gap is the difference between remotion's `streaming-backpressure` driver (which keeps the encoder queue full via `waitForQueueToBeLessThan` backpressure) and mediabunny's `streaming-lockstep` pipeline (which serializes decode→encode per frame, leaving the hardware encoder idle between frames). Interestingly mediabunny posts far fewer long-task ms (874 vs 2147) — its lockstep model yields a more responsive main thread — but that does not win on the primary `wall` metric. Both are correct; remotion is simply faster end-to-end.

The oracle evidence is identical across the three winners: `ssim-psnr` reports **SSIM min 1.0000 (mean 1.0000) over 12 frames** for each — remotion `ssimMin 0.99999461`, mediabunny `ssimMin 0.99999657`, ffmpeg `ssimMin 0.99999975` — all far above the 0.98 floor. The oracle decodes the engine's MP4 output with the platform decoder and SSIMs it against in-browser-decoded reference source frames (`src/core/oracles.ts:1737-1738`, reference path), because there is no committed pixel golden for a transcode. `exactFrames == 0` for all three (digest proxy: 0/12), which is expected — VP9→H.264 re-encode never produces byte-identical RGBA digests — so PSNR is reported as "via golden pixels unavailable" and the gate rests on the measured perceptual SSIM. `playback-smoke` confirms the produced MP4 actually plays (`<video> played a few frames`), proving the file is a well-formed, decodable MP4 and not garbage.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on speed. Same WebCodecs HW backend, same correctness (SSIM min 0.99999657), but `streaming-lockstep` pipeline yields wall 1775 ms vs 1291 ms (1.37x slower), 5.64x vs 7.75x realtime, 169 vs 232 encodeFps. Sole loss is throughput; it is the legitimate runner-up.
- **ffmpeg.wasm@0.12.15** — PASS but a distant third. Single-thread wasm software libvpx-decode + x264-encode: wall 29831 ms (**23.1x slower** than the winner), 0.335x realtime (slower than playback), 10.1 encodeFps. Correctness is actually marginally best (SSIM min 0.99999975) but irrelevant given all three pass; the wasm encode is the bottleneck.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — it is a demux-only WASM (libav demuxer), has no encoder, correctly declines.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — parser/probe library, read-only, no encode path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — MP4 (re)muxer/box editor, no codec decode/encode.
- **platform@chrome-149** — NA_ENGINE with a specific, honest rationale: the platform transcode path is `<video>→canvas→MediaRecorder`, which captures video frames only and **drops the audio track**, so it cannot satisfy the requested AAC audio output. This is a genuine capability limit of the canvas-capture approach, not an under-declaration (returned in 3 ms, no oracle run).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:138-148`. Input `asset: 'vp9_1080p_10s.webm'`, declared `fromVideo: vp9 / fromAudio: opus`, `toVideo: h264 / toAudio: aac`, container webm→mp4. Tolerances ssimMin 0.98 / psnrMinDb 38.
- **Fixture exists & is real:** `fixtures/media/vp9_1080p_10s.webm` — 9,293,670 bytes (9.29 MB). A genuine 1080p/10 s VP9+Opus WebM, not synthetic/empty/mock. Throughput math is consistent: 7.75x realtime on a 10 s clip → ~1.29 s wall, matching the reported 1291 ms.
- **Oracle implementation:** `ssim-psnr` at `src/core/oracles.ts:1688`; transcode (no committed golden) routes through the reference-source path `ssimVsReferenceSource` (`oracles.ts:1737-1842`), which decodes the engine's MP4 output with the platform decoder and SSIMs against freshly in-browser-decoded source frames. It gates on the WORST frame (`minSsim >= t.ssimMin`, `oracles.ts:1823`) — not the mean — and FAILs cleanly on undecodable output (`oracles.ts:1729-1734`). Not trivially satisfiable: a copied-input or garbage MP4 would fail the platform re-decode or the SSIM floor. `playback-smoke` additionally requires the output to actually play.
- **Winner adapter:** `src/engines/remotion-webcodecs/adapter.ts:521` (`transcode`) → `:580` (`convert` driving real `@remotion/webcodecs` `convertMedia` with `bufferWriter`, `:615`). Genuine re-encode: maps codecs (`:536-551`), drives WebCodecs VideoEncoder/AudioEncoder, returns real `result.save()` bytes (`:629`). No canned output, no input→output copy, no golden short-circuit, no error-swallow (errors throw, e.g. `:537`, `:843`).
- **Verdict: WEAK-GATE.** The implementation, fixture, and pipeline are unambiguously REAL, and SSIM is genuinely measured (0.99999, well above floor). But the correctness gate for this transcode is a **perceptual proxy**: `exactFrames == 0` (no bit-exact / golden-packet check possible for a re-encode), PSNR is "unavailable" and not enforced, and `playback-smoke` is a smoke gate. The PASS is real and strong enough to distinguish a working transcode from a broken one, but it is not a bit-exact or structural-exact oracle — so on the correctness ladder this is proxy-tier, hence WEAK-GATE rather than REAL. No evidence of cheating.
- **Cached note:** ALL three PASS results have `cached: true` ("cached previous PASS result"). The winner was REUSED, not re-run this session — staleness risk applies to the absolute timing numbers (the 1.37x gap was not re-measured live). Per launcher-seeding caveat, a clean re-run would require clearing raw + .browser-cache. n==1 for every metric (mad=0) so per-engine variance is unknown.

## Confidence & caveats

Confidence **medium**. Winner ordering is solid: remotion-webcodecs beats mediabunny by a consistent 1.37x across three independent metrics (wall, throughput, encodeFps) and beats ffmpeg.wasm by ~23x, with identical correctness for all three. Caveats: (1) every metric is a single sample (n==1, mad=0, p95==median) — no variance, and the 1.37x margin over mediabunny is modest enough that a re-run could narrow it (the order-of-magnitude ffmpeg gap is safe regardless); (2) all results are cached, so timings reflect a prior run; (3) peakMemory and decodeFps are unmeasured (n=0) for all engines, so no memory/decode tiebreak was possible; (4) the gate is a perceptual SSIM proxy (WEAK-GATE), so PASS proves a correct-looking, playable transcode but not bit/structural exactness.
