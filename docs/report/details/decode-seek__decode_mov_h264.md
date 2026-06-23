# decode-seek/decode_mov_h264

family: decode-seek | fixture asset: `h264_1080p_5s.mov` (4.4 MB, QuickTime .mov, H.264 1080p30 + AAC stereo 48k) | primaryMetric: decodeFps | passCount: 5

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (env.engineId `remotion-webcodecs@4.0.479`).
- **CONTESTED**: 5 engines PASS. Four of them (mediabunny, platform, remotion-webcodecs, web-demuxer) are bit-exact (`exactFrames==12`, SSIM=1, PSNR=∞ via digest match). ffmpeg-wasm PASSes only on the weaker SSIM proxy (`exactFrames==0`).
- Decisive factor: among the four digest-bit-exact engines (correctness is a tie at the top of the ladder), remotion-webcodecs wins on the primary metric **decodeFps = 58.78** and lowest **wall = 1020.7 ms**.
- Margin over runner-up (platform@chrome-149, the fastest of the rest at 46.29 fps / 1296.3 ms): **1.27x faster decodeFps, 0.79x wall (1.27x faster)**. vs mediabunny (44.15 fps): 1.33x. vs web-demuxer (40.23 fps): 1.46x. All on n==1, so the margin is suggestive, not statistically firm.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (exact 12/12) | 1020.70 | n/a (decodeFps 58.78) | 530,988,463 | 19963 | cached previous PASS result |
| platform@chrome-149 | PASS | ssim-psnr:pass (exact 12/12) | 1296.29 | n/a (decodeFps 46.29) | 1,403,156,005 | 2477 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (exact 12/12) | 1358.88 | n/a (decodeFps 44.15) | 0 (not sampled) | 1017 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (exact 12/12) | 1491.55 | n/a (decodeFps 40.23) | 0 (not sampled) | 3234 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (exact 0/12, SSIM proxy) | 1936.29 | n/a (decodeFps 30.99) | 2,989,972,385 | 1840 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'decodeFrames' |

(No engine reports `throughputRealtime`/`timeToFirstFrame`/`peakMemory` consistently; primaryMetric for this scenario is `decodeFps`. mediabunny and web-demuxer did not sample peakMemory, n==0.)

## Why the winner wins (deep technical)

This row exercises the **QuickTime .mov decode path** for H.264. The container is `mov` with `major_brand: "qt  "` (golden meta), carrying H.264 1080p30 video + AAC stereo. The mechanical difference from the .mp4 rows is that the sample table / chunk-offset layout follows QuickTime conventions (`stco`/`co64`/`stsc` chunk geometry, `qt  ` brand) rather than ISOBMFF `moov` ordering, so the demuxer must correctly walk the QuickTime sample tables to produce encoded chunks in decode order, while the actual elementary stream (avcC + NAL units) is identical to the .mp4 case — which is why all working engines converge on the same golden frame digests.

remotion-webcodecs decodes **genuinely**: `decodeFrames` (src/engines/remotion-webcodecs/adapter.ts:651) parses the container with `@remotion/media-parser` (`mp.parseMedia`, line 661), and for the video track builds a real `VideoDecoderConfig` from the parsed track (`codec`, `codedWidth`, `codedHeight`, `description` = the avcC, `colorSpace`; lines 667-673), then feeds every encoded sample into the library's native-WebCodecs `createVideoDecoder` (line 675) via `d.decode({...})` (line 705) with real backpressure (`d.waitForQueueToBeLessThan(16)`, line 704). Each emitted `VideoFrame` is rasterized to normalized straight-alpha RGBA and digested (`imageDataFromVideoFrame` line 684; `digestImageData` line 727). Frames are sorted into presentation order by pts before digesting (line 722) so the digest list aligns with golden ordering. The backend (env.configUsed) is `webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure`, on the Apple M1 Max GPU — i.e. it ran hardware H.264 decode.

The oracle outcome is the strongest available tier: ssim-psnr with **pairs=12, exactFrames=12, ssimMean=1, ssimMin=1** — every decoded frame's sha256 matched the committed browser-baked golden (`h264_1080p_5s.mov.frames.json`, `pending:false`), so the oracle short-circuits to digest-identical / PSNR=∞ (oracles.ts:1766, 1803-1809). That is bit-exact correctness, indistinguishable in strength from the other three exact engines.

Correctness being a four-way tie at the top of the ladder, the decision falls to performance (procedure step 4b). On the primary metric remotion-webcodecs decoded at **58.78 fps** vs platform 46.29, mediabunny 44.15, web-demuxer 40.23, ffmpeg-wasm 30.99 — a 1.27x lead over the nearest, and its wall (1020.7 ms) is the lowest. It also used by far the least peakMemory of the engines that sampled it (531 MB vs platform 1.40 GB = 0.38x, vs ffmpeg-wasm 2.99 GB = 0.18x). The plausible mechanism: media-parser streams samples with bounded queue depth (`waitForQueueToBeLessThan(16)`) and the adapter declares MOV-specific fast paths (env.configUsed.adapterFastPaths: "mp4-sample-table:http-range" and "compatible MOV->MP4 ftyp rewrite") so the H.264 stream reaches the hardware decoder with minimal buffering, whereas the platform engine's `<video>`/canvas pixel path and ffmpeg-wasm's full software decode carry much larger memory and CPU overhead.

## What each other framework did wrong

- **platform@chrome-149** — PASS, bit-exact (exact 12/12), but lost on speed: 46.29 fps vs 58.78 (0.79x), wall 1296.3 ms (1.27x slower), and peakMemory 1.40 GB (2.6x the winner's). Its `<video>→canvas→MediaRecorder` pixel path is heavier than the winner's direct VideoFrame rasterization.
- **mediabunny@1.48.0** — PASS, bit-exact (exact 12/12), but 44.15 fps (0.75x) and slowest-but-one wall 1358.9 ms. Lowest longtasks (1017 ms) — smoothest main thread — but the metric that ranks is decodeFps, where it trails. peakMemory not sampled (n==0).
- **web-demuxer@4.0.0** — PASS, bit-exact (exact 12/12), slowest of the bit-exact group at 40.23 fps (0.68x) and highest wall 1491.5 ms among them; wasm demux + WebCodecs decode is correct but slower feeding the decoder. peakMemory not sampled.
- **ffmpeg.wasm@0.12.15** — PASS but on the WEAKER proxy: `exactFrames=0/12`, ssimMin=0.99995 (its software-decoded RGBA digests do not match the browser-baked golden, so it falls back to the luma-signature SSIM gate rather than digest equality). Also slowest overall (30.99 fps, wall 1936.3 ms) and by far the most memory (2.99 GB). Correctness is weaker AND it is slowest.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — mp4box.js is a demuxer/box parser, it has no decode capability, so not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". Honest NA — media-parser parses/demuxes but does not itself decode pixels (the decode capability lives in the separate remotion-webcodecs package, which is the winner here).

## Anti-cheat validation

- Scenario definition: src/scenarios/decode-seek/index.ts:134-144 (`id: 'decode_mov_h264'`, `asset: 'h264_1080p_5s.mov'`, container mov, videoCodec h264, maxFrames 60). Notes call out the QuickTime sample-table/chunk-offset decode path as the point of the row.
- Fixture: `fixtures/media/h264_1080p_5s.mov` EXISTS, 4.4 MB — a real QuickTime file (golden meta confirms `major_brand "qt  "`, 1080p30 H.264 + AAC). Not synthetic/empty/mock.
- Golden: `fixtures/golden/h264_1080p_5s.mov.frames.json` ships real per-frame sha256 digests with `pending:false` (browser-baked), so the digest-equality gate is a real comparison, not a placeholder skip.
- Oracle: ssim-psnr at src/core/oracles.ts:1688; digest-equality short-circuit at oracles.ts:1766; exact-all PASS branch at oracles.ts:1803-1809; SSIM-floor gate (ssimMin≥0.99) at oracles.ts:1823. The winner hit the bit-exact branch (12/12), the strongest path — not the loose SSIM fallback.
- Winner adapter: src/engines/remotion-webcodecs/adapter.ts:651-730 — genuine `parseMedia` + native `createVideoDecoder` + real `decode()` with backpressure + per-frame rasterize/digest. No canned output, no input→output copy, no golden short-circuit, no error swallowing (decodeError is re-thrown, line 719).
- Verdict: **REAL**. Real fixture, real WebCodecs decode, meaningful bit-exact oracle (12/12 digest-identical).
- Cached note: winner's result has `cached==true` ("cached previous PASS result"), as do ALL five PASS engines — none was re-run in this pass, so the comparison is a reuse of prior runs (staleness risk). The numbers are internally consistent and plausible, but the head-to-head was not freshly re-measured.

## Confidence & caveats

- Confidence: **medium**. The winner is REAL and unambiguously bit-exact, but the performance lead rests on **n==1** samples (mad=0, no spread) and **cached** results for every engine, so the 1.27x decodeFps margin over platform is suggestive rather than statistically robust.
- Caveat: remotion-webcodecs reports a very high `longtasks=19963 ms` — roughly 8-20x the others (mediabunny 1017, platform 2477, web-demuxer 3234) — indicating heavy main-thread blocking during this run despite the fast wall/decodeFps. If main-thread responsiveness were the ranked metric, the winner would flip (mediabunny). Under the stated procedure decodeFps is primary, so remotion-webcodecs wins, but this is the one signal that argues against it.
- Caveat: ffmpeg-wasm's PASS is genuine but on the weaker SSIM proxy (exactFrames=0); if the gate required bit-exact it would be NA/borderline, not a peer of the top four.
