# decode-seek/decode_extreme_fps_240

family: decode-seek | fixture asset: `video_240fps.mp4` (H.264 in MP4, 320x240, 240fps, ~2s, 153 KB) | primaryMetric: decodeFps (higher better) | passCount: 5 / 7

## Verdict

- Best framework: **web-demuxer@4.0.0** (engineId `web-demuxer`).
- **CONTESTED**: 5 of 7 engines PASS (web-demuxer, platform, ffmpeg-wasm, remotion-webcodecs, mediabunny). Two NA_ENGINE (remotion-media-parser, mp4box).
- Decisive factor: all 5 PASS through the **same** gating oracle (`ssim-psnr`), so correctness strength is comparable; the decision falls to PERFORMANCE on the primary metric `decodeFps`. web-demuxer is fastest at **1166.69 fps** and also ties the best correctness (SSIM min 1.0000, identical to platform).
- Margin over runner-up (platform@chrome-149, 968.70 fps): **1.20x higher decodeFps** and **1.20x lower wall** (205.71 ms vs 247.75 ms). web-demuxer additionally matches platform's perfect SSIM (1.0000) while the wasm/mediabunny PASSers sit ~0.972. Caveat: n==1, mad==0 on every metric (single timed sample) and all results are cached — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (SSIM 1.0000) | 205.71 | 1166.69 | n/a (0 samples) | 555 | passed |
| platform@chrome-149 | PASS | ssim-psnr:true (SSIM 1.0000) | 247.75 | 968.70 | 141,158,637 | 632 | passed |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (SSIM 0.9721) | 273.23 | 878.38 | 540,671,112 | 20,024 | passed |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (SSIM 0.9717) | 289.00 | 830.44 | n/a (0 samples) | 3,638 | passed |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (SSIM 0.9720) | 430.44 | 557.56 | n/a (0 samples) | 9,925 | passed |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is `decodeFrames` (src/scenarios/decode-seek/index.ts:289) over a high-frame-rate H.264-in-MP4 clip: 320x240 at a declared 240 fps (golden meta: `fps: 240`, `bitrate: 599600`, `durationSec: 2`). The stress here is dense timestamp spacing and high decode throughput — many short-duration AVC samples must be demuxed and fed to a decoder back-to-back. The scenario notes (index.ts:249-251) flag "dense timestamps / high decode throughput" and deliberately loosen the SSIM floor to 0.96 for cross-decoder RGB conversion differences.

web-demuxer's adapter does NOT roll its own pixel decoder. Per its header (src/engines/web-demuxer/adapter.ts:6-8) it is a demuxer/parser that hands back ready-to-use WebCodecs objects (a `VideoDecoderConfig` plus `EncodedVideoChunk`s). `decodeFrames` (adapter.ts:848-947) drives the **browser's** WebCodecs `VideoDecoder`: it gets the decoder config including extradata (adapter.ts:853), self-gates via `VideoDecoder.isConfigSupported()` and throws on unsupported codecs (adapter.ts:855-858), then runs a pipelined streaming loop — it reads demuxed chunks from `d.read('video')` and submits them to `decoder.decode()` as fast as they arrive (adapter.ts:887-896), with a reorder window (`maxFrames + 16`, adapter.ts:863) so B-frame presentation order is correct before slicing the lowest-pts `maxFrames` (adapter.ts:926-927). Each emitted `VideoFrame` is rastered to ImageData and digested with the SHARED normalization/sha256 used by oracles.ts and the platform engine (adapter.ts:55-57, 933-934), so its digests are directly comparable to golden.

Mechanistically, web-demuxer wins because (1) it uses the **same hardware-backed WebCodecs `VideoDecoder` path** as platform (the M1 Max VideoToolbox H.264 decoder via ANGLE/Metal), so its decoded pixels are byte-comparable to platform's — its SSIM is min **1.0000** (measurements ssimMin 0.9999999993, mean 0.9999999994 over 12 pairs), tying platform exactly and beating the wasm decoders at ~0.972; and (2) it has the **leanest demux + frame-handoff path** of the WebCodecs group. Its FFmpeg-WASM core does only demuxing/packetization (no pixel decode), so the expensive AVC slice decode runs on the GPU while web-demuxer streams packets, yielding the highest throughput: **1166.69 decodeFps** and **205.71 ms wall**, against platform's 968.70 fps / 247.75 ms (1.20x on both). Its long-task time (555 ms) is the lowest of all five, confirming a light main-thread footprint vs platform's 632 ms, remotion-webcodecs' 3638 ms, mediabunny's 9925 ms, and ffmpeg-wasm's 20,024 ms.

On the SSIM oracle (src/core/oracles.ts:1688-1832): with a committed golden ssim signature set (`video_240fps.mp4.ssim.json`, 78 KB) and decoder-provided pixels (`getPixels` present), the oracle compares each candidate frame's downsampled luma signature to the golden per-frame signature (oracles.ts:1773-1786) and gates on the WORST frame (`minSsim >= 0.96`, oracles.ts:1823). web-demuxer and platform both reach min 1.0000 because they decode with the identical browser pipeline that produced the golden; the three wasm/pure-TS decoders (ffmpeg-wasm 0.9721, remotion-webcodecs 0.9717, mediabunny 0.9720) clear the 0.96 floor but carry small RGB-conversion deltas — exactly what the loosened tolerance anticipates. exactFrames is 0/12 for all engines (the digest-equality PSNR proxy never fires), so the PSNR gate rests on SSIM (documented limitation, oracles.ts:1824-1827).

## What each other framework did wrong

- **platform@chrome-149** (PASS, runner-up): correct (SSIM 1.0000) but **1.20x slower** — 968.70 fps vs 1166.69, 247.75 ms vs 205.71 ms wall. It is the only engine that reported peakMemory (141,158,637 B). Loses purely on throughput; its `<video>→canvas→MediaRecorder` encode wiring (env.configUsed) adds main-thread weight not needed for pure decode.
- **ffmpeg.wasm@0.12.15** (PASS): correctness weaker (SSIM min 0.9721 vs 1.0000 — software RGB conversion delta) AND far slower/heavier: 878.38 fps, 273.23 ms wall, **540,671,112 B peak memory** (3.8x platform), and a punishing **20,024 ms** of long tasks (single-thread wasm decode blocking the main thread).
- **remotion-webcodecs@4.0.479** (PASS): also WebCodecs-backed but slower than web-demuxer/platform — 830.44 fps, 289.00 ms wall, 3638 ms long tasks; SSIM min 0.9717 (lowest of the five). Its backpressure/queue-wait pipeline and offscreen-2d raster add overhead relative to web-demuxer's tight read→decode loop.
- **mediabunny@1.48.0** (PASS): slowest of the PASSers — 557.56 fps (2.09x slower than web-demuxer), 430.44 ms wall, 9925 ms long tasks, SSIM min 0.9720. Correct but uncompetitive on this high-fps throughput stress.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'decodeFrames'". HONEST NA — it is a parser/metadata library with no pixel-decode capability, correctly under-declared rather than faking a decode.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare operation 'decodeFrames'". HONEST NA — mp4box.js is an MP4 box parser/demuxer; it does not decode H.264 pixels, so not declaring decodeFrames is correct.

## Anti-cheat validation

- Scenario definition: src/scenarios/decode-seek/index.ts:241-252 (`id: 'decode_extreme_fps_240'`, `asset: 'video_240fps.mp4'`, container mp4, codec h264, maxFrames 240, ssimMin 0.96). op `decodeFrames` wired at index.ts:289.
- Fixture: `fixtures/media/video_240fps.mp4` EXISTS (153 KB, real H.264/MP4). Golden set present and plausible: `video_240fps.mp4.meta.json` (320x240, 240fps, 2s, bitrate 599600), `.ssim.json` (78 KB luma sigs), `.frames.json`, `.packets.json` (54 KB). Not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:1688-1832 (`ssim-psnr`). Performs a REAL per-frame downsampled-luma-signature SSIM against the committed golden, gating on the worst frame at >= 0.96 (oracles.ts:1823). Not trivially satisfiable — wasm decoders land at 0.9717-0.9723, only the WebCodecs pair reach 1.0000, showing the gate discriminates. measurements (pairs 12, ssimMin/Mean populated) are physically plausible.
- Winner adapter: src/engines/web-demuxer/adapter.ts:848-947 (`decodeFrames`). GENUINE — demuxes real packets via the web-demuxer WASM core, configures and drives a real `VideoDecoder` (adapter.ts:855,867,883,894), rasterizes actual `VideoFrame`s and hashes with the shared digest (adapter.ts:933-934). No canned output, no input copy, no short-circuit to golden; it throws (clean error) when the browser cannot configure the codec (adapter.ts:856-858).
- Verdict: **REAL** on implementation/fixture/oracle. Caveat tempering strength: the gate is the perceptual SSIM proxy (not bit-exact) and exactFrames==0/12, so the win is a real PASS on a perceptual oracle, not a crypto/bit-exact one. Because the decision among PASSers is by performance, the verdict is REAL (the correctness gate is genuine and discriminating); a stricter decoded-frames-bitexact oracle is unavailable here because golden never ships raw pixels (oracles.ts:1799-1802).
- Cached note: ALL 7 entries have `cached: true` ("cached previous PASS result"). The winner's numbers were reused, not re-run this pass — staleness risk applies to every metric and to the SSIM outcome.

## Confidence & caveats

- Confidence: medium. The ranking is unambiguous on the recorded data (web-demuxer leads decodeFps by 1.20x and ties the best SSIM), and code/fixtures/oracle all check out as real.
- Every metric is n==1 with mad==0 and warmup==1 — a single timed sample per engine, so the 1.20x throughput margin over platform is real but thin evidence; a re-run could narrow or invert it given both share the same hardware WebCodecs decoder.
- All results are cached==true; honest fresh re-run recommended (clear raw + .browser-cache) before treating the margin as durable.
- The gating oracle is perceptual (SSIM proxy), not bit-exact; exactFrames==0/12 for all engines. web-demuxer and platform reach SSIM 1.0000 only because they reuse the browser pipeline that baked the golden — a structural caveat, not a cheat.
