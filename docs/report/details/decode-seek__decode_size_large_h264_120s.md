# decode-seek/decode_size_large_h264_120s

family: decode-seek | fixture asset: `large_h264_1080p_120s.mp4` (1080p H.264 in MP4, ~90 MB / 120 s) | primaryMetric: decodeFps | passCount: 5 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- Contested: YES — 5 engines PASS the gate; 4 of them (platform, mediabunny, remotion-webcodecs, web-demuxer) are bit-exact (12/12 digest-identical frames).
- Decisive factor: correctness is tied among the 4 bit-exact engines (all `exactFrames`==12, SSIM=1, PSNR=∞), so the win is decided on the primary metric **decodeFps**. mediabunny is fastest at **51.27 fps** with the lowest **wall median 1170.3 ms**.
- Margin over runner-up (platform@chrome-149, 44.30 fps / 1354.3 ms): **1.157x higher decodeFps, 1.157x lower wall**. Caveat: both decisive metrics are single-sample (n=1, mad=0), so the margin is suggestive, not statistically robust.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true (12/12 exact) | 1170.31 | n/a (decodeFps 51.27) | 0 (not measured) | 19963 | cached previous PASS result |
| platform@chrome-149 | PASS | ssim-psnr:true (12/12 exact) | 1354.31 | n/a (decodeFps 44.30) | 0 (not measured) | 192 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (12/12 exact) | 1748.16 | n/a (decodeFps 34.32) | 0 (not measured) | 205 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (0/12 exact, SSIM 0.99995) | 1867.70 | n/a (decodeFps 32.13) | 3,088,828,256 | 6348 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (12/12 exact) | 6953.47 | n/a (decodeFps 8.63) | 0 (not measured) | 315 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

(throughputRealtime is not present in this shard's bench; primaryMetric here is decodeFps, reported in the cell.)

## Why the winner wins (deep technical)

The operation is `decodeFrames` over a sustained 120-second 1080p H.264 elementary stream in an MP4 container, sampled over the leading `maxFrames: 60` frames (the oracle paired the first 12 against golden). All four WebCodecs-backed engines decode the same AVC NAL units through the same Chrome 149 hardware H.264 decoder (ANGLE Metal on Apple M1 Max), so the *pixels* are identical — confirmed by every bit-exact engine reporting `exactFrames`==12 / `ssimMin`==1 / PSNR=∞. The differentiator is therefore the demux + frame-delivery pipeline overhead, which the primary metric `decodeFps` captures directly.

mediabunny's adapter (`src/engines/mediabunny/adapter.ts:1387`) takes the hardware fast path: it constructs a `VideoSampleSink(videoTrack, …)` with `videoDecoderOptionsForTrack` (which requests `hardwareAcceleration: 'prefer-hardware'`, per `env.configUsed.hwAccel`), then iterates `sink.samples()` (`adapter.ts:1392`) and copies each `VideoSample` straight to RGBA via `imageDataFromVideoSample` → `sample.copyTo(rgba, { format: 'RGBA' })` (`adapter.ts:1754`), digesting with `digestImageData` (`adapter.ts:1399`). Crucially it avoids canvas readback for ordinary (untransformed) frames, sidestepping the privacy-noised 2D-canvas path that other engines pay. The config (`coopCoep: 'not-required'`, `sharedArrayBuffer: false`, `wasmThreads: 0`, pure-TS ESM core) means there is no wasm transcode and no cross-origin-isolation requirement — the demux is native TS feeding directly into the hardware `VideoDecoder`. That streaming-lockstep pull yields the top decodeFps **51.27** and lowest wall **1170.31 ms**.

The platform baseline (`env.configUsed.decode: 'VideoDecoder'`, `pixelBackend: 'webgpu>webgl>offscreen2d'`, `frameTransfer: 'transferable'`) is also a clean hardware WebCodecs path and is correctly bit-exact, but it trails at 44.30 fps / 1354.31 ms — ~16% slower wall. web-demuxer routes packets through a wasm demuxer feeding the same hardware decoder and is third at 34.32 fps. The interesting trade-off is **longtasks**: mediabunny logged a very large 19963 ms of long-task time on the main thread (its `pipeline: 'streaming-lockstep'` decodes on the main thread), versus platform's 192 ms and web-demuxer's 205 ms. So mediabunny wins on raw throughput and wall but is the worst main-thread citizen here — a genuine UX caveat for a 120 s sustained decode.

## What each other framework did wrong

- **platform@chrome-149 (PASS, runner-up):** correctness-tied (12/12 exact) but slower — decodeFps 44.30 vs 51.27 (0.864x) and wall 1354.31 vs 1170.31 ms (1.157x slower). Loses purely on the primary metric. (It is the better main-thread citizen: longtasks 192 ms vs 19963 ms.)
- **web-demuxer@4.0.0 (PASS):** bit-exact (12/12) but third on throughput — decodeFps 34.32 (0.67x of winner), wall 1748.16 ms (1.49x slower); its wasm demux stage adds overhead ahead of the hardware decoder.
- **ffmpeg.wasm@0.12.15 (PASS, but WEAKER correctness):** passed the gate only on the perceptual proxy — `exactFrames`==0/12, SSIM≈0.99995 via downsampled-luma signature, PSNR unavailable. Its software wasm H.264 decode produces slightly different RGB than the hardware golden, so it is NOT bit-exact (one rung weaker on the correctness ladder). It is also the slowest of the non-remotion engines (32.13 fps) and shows a huge `peakMemory` of 3.09 GB — the only engine that materialized large buffers, consistent with whole-file wasm decoding of a 90 MB input.
- **remotion-webcodecs@4.0.479 (PASS):** bit-exact (12/12) but dramatically slower — decodeFps 8.63 (0.168x of winner), wall 6953.47 ms (5.9x slower). Despite `hwAccel: 'prefer-hardware(+software fallback)'`, its `streaming-backpressure` + `offscreencanvas-2d` pixel path plus `convert=main-thread` orchestration crushes sustained throughput on this large clip.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** does not declare operation `decodeFrames`. Honest NA — media-parser is a demux/parse library with no decode-to-pixels surface, so the missing capability is genuine, not under-declared.
- **mp4box@2.3.0 (NA_ENGINE):** does not declare operation `decodeFrames`. Honest NA — mp4box.js is an MP4 box parser / sample extractor and does not decode pixels; correctly declines.

## Anti-cheat validation

- Scenario definition: `src/scenarios/decode-seek/index.ts:367` (`id: 'decode_size_large_h264_120s'`, `asset: 'large_h264_1080p_120s.mp4'`, container mp4, codec h264, `maxFrames: 60`, `heavyBake: true`). Mapped to op `decodeFrames` at `src/scenarios/decode-seek/index.ts:404-420` with `primaryMetric: 'decodeFps'` and `DECODE_ORACLES` (ssim-psnr).
- Fixture: `fixtures/media/large_h264_1080p_120s.mp4` EXISTS and is a real 90 MB file (verified via stat) — not synthetic/empty/mock.
- Oracle: `ssimPsnr` at `src/core/oracles.ts:1688`. It performs a real per-frame comparison: digest equality on normalized RGBA (`oracles.ts:1766`) for the bit-exact PSNR=∞ path, with a downsampled-luma SSIM fallback (`oracles.ts:1782-1786`). It is NOT trivially satisfiable — ffmpeg.wasm shows the gate distinguishes exact (12/12) from proxy (0/12) outcomes, and the winner's `exactFrames`==12 with SSIM=1 is physically plausible for identical hardware-decoded frames.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1330` (`decodeFrames`), real WebCodecs path at `adapter.ts:1387-1406` (VideoSampleSink → sample.copyTo(RGBA) → sha256 digest). No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing (frames are produced from the live decoder loop).
- Verdict: **REAL** — real 90 MB fixture, genuine hardware WebCodecs decode in the adapter, and a meaningful bit-exact (digest) oracle that separates exact from proxy passes. For mediabunny specifically the gate is the strongest tier (12/12 digest-exact), not a smoke/loose proxy.
- Cached note: ALL 7 entries are `cached: true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; numbers carry the usual staleness risk per the launcher-seeding caveat. mediabunny was last run 2026-06-22T13:59:38Z.

## Confidence & caveats

- Confidence: **high** on correctness ranking (digest-exact vs proxy is unambiguous; NA reasons are honest). Medium on the performance margin: the decisive decodeFps/wall metrics are single-sample (n=1, mad=0, p95==median), so the 1.157x lead over platform is directional rather than statistically firm.
- Significant caveat: mediabunny wins throughput but logs 19963 ms of longtasks (main-thread blocking) vs platform's 192 ms — for an interactive UI on a 120 s clip, platform may be preferable despite lower fps.
- All results are cached; a fresh re-run (clear raw + .browser-cache) would harden the perf numbers.
