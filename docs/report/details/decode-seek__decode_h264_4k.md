# decode-seek/decode_h264_4k

family: decode-seek | fixture asset: `fixtures/media/h264_4k_10s.mp4` (3840×2160 H.264/MP4, ~26 MB) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

- Best framework: **platform@chrome-149** (Chrome WebCodecs `VideoDecoder`, hardware-accelerated).
- **CONTESTED**: 5 of 7 engines PASS the `ssim-psnr` gate. Four of them (platform, remotion-webcodecs, web-demuxer, mediabunny) are digest-identical to golden (exactFrames=12, SSIM=1, PSNR=∞), so they are tied on correctness strength. ffmpeg.wasm also PASSes but only via the SSIM-signature proxy (exactFrames=0), making it correctness-weaker. Performance therefore decides among the four exact engines.
- Decisive factor: **decodeFps (primaryMetric) + wall + longtasks**. platform leads on all three:
  - decodeFps 11.903 fps vs runner-up remotion-webcodecs 11.816 fps → **1.007×** (essentially a tie on throughput).
  - wall 2520.3 ms vs remotion-webcodecs 2538.99 ms → **1.007× faster**; vs mediabunny 2678.4 ms → 1.06×; vs web-demuxer 2702.4 ms → 1.07×.
  - longtasks 1007 ms vs remotion-webcodecs 9925 ms (**9.86×** fewer main-thread blocking ms), vs web-demuxer 3675 ms (3.65×), vs mediabunny 11971 ms (11.89×). This is the genuinely decisive, large margin.
- Margin over runner-up (remotion-webcodecs): throughput tie (1.007×), but platform blocks the main thread ~9.86× less (1007 ms vs 9925 ms longtasks). Caveat: every result is `cached==true` and n==1.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 2520.28 | n/a (decodeFps 11.903) | 2,859,469,658 | 1007 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 2538.99 | n/a (decodeFps 11.816) | 0 (unmeasured) | 9925 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 2678.41 | n/a (decodeFps 11.201) | 0 (unmeasured) | 11971 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (exact 12/12, SSIM=1) | 2702.40 | n/a (decodeFps 11.101) | 0 (unmeasured) | 3675 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (proxy, exact 0/12, SSIMmin 0.99995) | 3583.68 | n/a (decodeFps 8.371) | 0 (unmeasured) | 20960 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

(There is no `throughputRealtime` metric in this shard; primaryMetric is `decodeFps`, shown in parentheses. `peakMemory` was only sampled by the platform engine; the other engines report n==0/0 bytes = unmeasured, not zero.)

## Why the winner wins (deep technical)

This is a pure **decode** scenario: 30 frames (capped) of 4K (3840×2160) H.264 in a progressive MP4 are decoded to RGBA and digested; the oracle compares the engine's decoded-frame SHA-256 digests against committed golden frame digests (`fixtures/golden/h264_4k_10s.mp4.frames.json`, with `…ssim.json` luma signatures as the SSIM fallback). All four exact engines run on the **same underlying decoder** — Chrome's hardware WebCodecs `VideoDecoder` on an Apple M1 Max (`env.gpu` = "ANGLE Metal Renderer: Apple M1 Max"). Because the actual VP/AVC bitstream decode is delegated to the same OS/GPU H.264 decoder in every case, the **pixels are identical** (all four are digest-exact, SSIM=1), so the differentiation is entirely in the *plumbing* around the decoder: demux cost, frame rasterization path, queue/backpressure discipline, and how much work lands on the main thread.

platform's `env.configUsed` is the leanest, most browser-native path: `backend: webcodecs`, `hwAccel: true`, `decode: VideoDecoder`, `pixelBackend: webgpu>webgl>offscreen2d`, `frameTransfer: transferable`, `queueDepth: 2`, `pipeline: streaming`. It demuxes the MP4 sample table directly and feeds `EncodedVideoChunk`s to a hardware `VideoDecoder` with a shallow queue depth of 2, and moves decoded frames via **transferable** objects to a WebGPU/WebGL rasterizer rather than a 2D-canvas readback. This is why its **longtasks total is 1007 ms** — roughly an order of magnitude below the others — and its **wall is the lowest at 2520 ms** with the **highest decodeFps (11.903)**. For 4K frames (each ~33 MB RGBA), the rasterization/readback path dominates, and the WebGPU-first transferable path keeps that work off long synchronous main-thread tasks.

The runner-up, **remotion-webcodecs**, lands essentially tied on throughput (11.816 fps, wall 2538.99 ms) — expected, since it also uses `backend: webcodecs` + `hwAccel: prefer-hardware(+software fallback)`. But its `pixelBackend` is `offscreencanvas-2d` and `pipeline: streaming-backpressure` with a `bufferWriter`; the 2D-canvas RGBA `copyTo`/readback per 4K frame on the main thread produces **9925 ms of longtasks** — 9.86× platform's. Same pixels, far worse responsiveness. **mediabunny** (`pixelBackend: VideoSample.copyTo(RGBA)>canvas`, `pipeline: streaming-lockstep`, `canvasPoolSize: 4`) is similar: exact frames, but lockstep decode + per-sample RGBA copy gives the worst longtasks of the exact group (11971 ms) and a slightly slower wall (2678 ms). **web-demuxer** decodes correctly through a wasm demux + WebCodecs decode (adapter `decodeFrames` at `src/engines/web-demuxer/adapter.ts:848`), but the wasm-side `read('video')` demux of a 26 MB 4K MP4 adds overhead: wall 2702 ms (slowest of the exact four) and longtasks 3675 ms.

ffmpeg.wasm is the standout *correctness* outlier: its decode is real but software (`libavcodec` in wasm), and it does **not** produce frames that digest-match the hardware golden — `exactFrames: 0/12`. It only passes because the SSIM-signature proxy floor (ssimMin 0.99995 ≥ 0.99) is satisfied; its pixels differ from golden at the bit level (different IDCT/chroma-conversion rounding than the hardware decoder). It is also far the slowest of all PASS engines (8.371 fps, wall 3583 ms, longtasks 20960 ms), consistent with single-thread software 4K H.264 decode (`wasmThreads` not enabled here).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, runner-up): correctness-tied (exact 12/12, SSIM=1) but loses on responsiveness — `offscreencanvas-2d` pixel readback yields **9925 ms longtasks vs platform's 1007 ms (9.86× worse)**; throughput is a virtual tie (11.816 vs 11.903 fps, wall 2538.99 vs 2520.28 ms).
- **mediabunny@1.48.0** (PASS): exact 12/12 but slowest-but-one wall (2678 ms, 1.06× platform) and **worst longtasks of the exact group (11971 ms, 11.89× platform)** from its lockstep + `VideoSample.copyTo(RGBA)` per-frame path; decodeFps 11.201.
- **web-demuxer@4.0.0** (PASS): exact 12/12, but its wasm demux of the 26 MB 4K MP4 makes it the **slowest exact engine on wall (2702 ms, 1.07× platform)**, decodeFps 11.101, longtasks 3675 ms.
- **ffmpeg.wasm@0.12.15** (PASS, weakest): only proxy-exact — **exactFrames 0/12**, passes purely via SSIM floor (ssimMin 0.99995); software wasm decode is the **slowest overall (8.371 fps, wall 3583 ms, longtasks 20960 ms)**. Correctness-weaker than the four hardware paths per the oracle ladder.
- **remotion-media-parser@4.0.479** (NA_ENGINE): honest NA — it is a parser/probe library and does not declare `decodeFrames` ("engine does not declare operation 'decodeFrames'"). Not an under-declared capability; producing decoded pixels is out of scope for a metadata parser.
- **mp4box@2.3.0** (NA_ENGINE): honest NA — mp4box is a pure ISOBMFF box parser/demuxer with no pixel decode; "engine does not declare operation 'decodeFrames'" is correct, not a hidden capability.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:158-168` (`id: 'decode_h264_4k'`, `asset: 'h264_4k_10s.mp4'`, container mp4, videoCodec h264, maxFrames 30, sizeBucket large). Notes flag a possible NA(browser) where a 4K-level decode session is unavailable — here the M1 Max hardware decoder is available, so the real engines decode.
- Fixture exists and is real media: `fixtures/media/h264_4k_10s.mp4` present, **~26 MB** — a genuine 4K H.264/MP4 clip, not synthetic/empty/mock. Golden committed: `fixtures/golden/h264_4k_10s.mp4.frames.json` (frame digests), `…ssim.json` (76 KB luma signatures), `…meta.json`, `…packets.json`.
- Oracle: `ssim-psnr` at `src/core/oracles.ts:1688`. It pairs the engine's decoded-frame SHA-256 digests against golden frame digests (line 1766: `normHex(cand.sha256) === normHex(want[i].sha256)` → exact); only declares PSNR=∞/all-exact when `exactCount === pairs` (line 1803). Falls back to downsampled-luma SSIM signature comparison (lines 1773-1786) when not digest-equal. This is a real comparison against committed goldens, not trivially satisfiable. Measurements are physically plausible: 12 paired frames, SSIM 1.0 for exact engines, ffmpeg.wasm SSIMmin 0.99995 (realistic software-vs-hardware delta).
- Winner adapter: platform engine decode via WebCodecs `VideoDecoder` (`env.configUsed.decode: "VideoDecoder"`, `backend: webcodecs`, `hwAccel: true`). For cross-check, the genuinely-implemented WebCodecs decode path is visible in `src/engines/web-demuxer/adapter.ts:848-947` (real `VideoDecoder.isConfigSupported` self-gate, real `decoder.decode(EncodedVideoChunk)` loop, real `imageDataFromVideoFrame` + shared `digestImageData`). No canned output, no copy-input-to-output, no short-circuit to golden, no swallowed errors reported as success (the decode loop rethrows on decodeError with 0 frames).
- Verdict: **REAL** — real 26 MB 4K H.264 fixture, real hardware WebCodecs decode, oracle does a genuine SHA-256 digest comparison against committed golden frames (exact 12/12 for the winner). Strength note: the oracle is classed as a perceptual proxy in the ladder, but here it operates in its strongest mode (digest-exact equality, not the loose SSIM floor), so the PASS is strong for the four exact engines.
- Cached note: **all 7 results have `cached==true`** ("cached previous PASS result") and every bench is **n==1** (mad=0, no spread). The decision is therefore on reused, single-sample evidence; the longtasks gap (9.86×) is large enough to survive single-sample noise, but the wall/decodeFps margins over remotion-webcodecs (~1.007×) are within run-to-run noise.

## Confidence & caveats

- Confidence: **medium**. The winner is clear on the decisive longtasks metric (1007 ms vs ≥3675 ms for all rivals), but the throughput/wall lead over remotion-webcodecs is a statistical tie (1.007×) on **n==1, cached** samples.
- All passing engines except ffmpeg.wasm decode through the same hardware H.264 decoder, so correctness is genuinely tied and the contest is about plumbing efficiency, not decode accuracy.
- `peakMemory` is only sampled by platform (2.86 GB — plausible for buffering 4K RGBA frames), so cross-engine memory comparison is not possible; this is the one axis where platform looks *worse*, but rivals simply did not measure it (n==0).
- Staleness risk: re-running fresh (clearing the cache) is advised before treating the wall/decodeFps ordering as authoritative; the longtasks ordering is robust.
