# transcode/h264_resize_4k_to_1080p

family: transcode | fixture asset: `fixtures/media/h264_4k_10s.mp4` (3840x2160 H.264 + AAC, 10.0s, 26 MB) | primaryMetric: wall (median ms) | passCount: 3 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS, hardware WebCodecs).
- Contested: **YES** — 3 engines PASS (mediabunny, ffmpeg-wasm, remotion-webcodecs), all with the same two oracles (`ssim-psnr`, `playback-smoke`).
- Decisive factor: **performance**. Correctness is statistically identical across the 3 PASS engines (all gate on `ssim-psnr` with SSIM min ~1.0000 and `exactFrames==0`, plus a `playback-smoke`), so the tie breaks on wall time / throughput.
- Margin over runner-up (remotion-webcodecs): **4.04x faster wall** (1090.8 ms vs 4403.0 ms), **4.04x higher realtime throughput** (9.17x vs 2.27x), **4.04x higher encodeFps** (275.0 vs 68.1 fps). Over the distant third (ffmpeg-wasm): **45.2x faster wall** (1090.8 ms vs 49348.0 ms).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:true, playback-smoke:true | 1090.8 | 9.1676 | 0 (not measured) | 2244 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true, playback-smoke:true | 4403.0 | 2.2712 | 0 (not measured) | 2414 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true, playback-smoke:true | 49348.0 | 0.2026 | 0 (not measured) | 2244 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio and MediaRecorder canvas-capture cannot preserve/copy audio |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

SSIM measurements (ssim-psnr, 12 pairs each): mediabunny ssimMin 0.9999805902, ssimMean 0.9999813586; ffmpeg-wasm ssimMin 0.9999935255, ssimMean 0.9999937358; remotion-webcodecs ssimMin 0.9999722397, ssimMean 0.9999750954. All three report `exactFrames: 0` (no bit-exact frames — expected for a resize).

## Why the winner wins (deep technical)

This scenario decodes a 4K (3840x2160) H.264-in-MP4 elementary stream, downscales to 1920x1080, re-encodes to H.264, and re-muxes into MP4 alongside the AAC audio track (`opts: { container: 'mp4', video: { codec: 'h264', width: 1920, height: 1080 } }`, scenario `src/scenarios/transcode/index.ts:189-201`). The dominant cost is the full decode→scale→encode loop over a 4K source: 4x the pixels of a 1080p clip, so the encoder backend is the decisive lever.

mediabunny ran on the WebCodecs path end-to-end. Its `env.configUsed` reports `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `canvasPoolSize: 4`. The adapter forces hardware acceleration on every Conversion video block (`src/engines/mediabunny/adapter.ts:47-49` doc, and `buildVideoOptions` at `src/engines/mediabunny/adapter.ts:546`+ which sets `hardwareAcceleration` and the required `fit` algorithm when both width and height are given, `adapter.ts:579-584`). The actual work is genuine: `transcode()` opens the input, builds an `Output` + `BufferTarget`, constructs `ConversionOptions`, and runs `Conversion.init(opts)` then `conversion.execute()` (`src/engines/mediabunny/adapter.ts:1284-1307`, helper `runConversion` invoked at `adapter.ts:1307`; the Conversion call sites are `adapter.ts:848` `Conversion.init` and `adapter.ts:855` `conversion.execute()`). Hardware H.264 encode on the Apple M1 Max (ANGLE Metal renderer per env.gpu) yields `encodeFps: 275.0` and `throughputRealtime: 9.17x`, finishing the 10s clip in **1090.8 ms**.

remotion-webcodecs also used WebCodecs (`backend: "webcodecs"`, `hwAccel: "prefer-hardware(+software fallback)"`, `pipeline: "streaming-backpressure"`, `pixelBackend: "offscreencanvas-2d"`). It is correct (SSIM min 0.99997) but ~4x slower at `encodeFps: 68.1` / `throughputRealtime: 2.27x` (wall 4403.0 ms). The gap is consistent across all three perf metrics (exactly 4.04x), pointing to a pipeline/pixel-transfer efficiency difference: mediabunny's `VideoSample.copyTo(RGBA)>canvas` with a 4-deep canvas pool and lockstep scheduling vs remotion's offscreencanvas-2d backpressure path. Its `longtasks` (2414 ms) are also slightly higher than mediabunny's (2244 ms), i.e. more main-thread blocking.

ffmpeg.wasm is the all-software outlier. It has no WebCodecs/GPU backend (no `configUsed.backend`), so decode+scale+encode of 4K runs entirely in single-thread WASM at `encodeFps: 6.08` / `throughputRealtime: 0.2026x` (slower than realtime), taking **49348.0 ms** — 45.2x mediabunny's wall. Its SSIM is marginally the highest (0.99999), but correctness is a tie across all three, so this does not save it on the perf tiebreak.

Tiebreaker reinforcement (decision step 4c): mediabunny uses hardware WebCodecs, requires no COOP/COEP (`coopCoep: "not-required"`, `sharedArrayBuffer: false`), and streams (streaming-lockstep) rather than whole-file buffering. It dominates on every available performance axis.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on performance: 4403.0 ms wall (4.04x slower), encodeFps 68.1 (0.25x), throughputRealtime 2.27x (0.25x), longtasks 2414 ms (higher). Correctness identical (SSIM min 0.99997, exactFrames 0). Lower pixel-pipeline efficiency on the offscreencanvas-2d backpressure path.
- **ffmpeg.wasm@0.12.15** — PASS but catastrophically slow: 49348.0 ms wall (45.2x slower), encodeFps 6.08, throughputRealtime 0.2026x (below realtime). Pure single-thread WASM, no hardware/WebCodecs backend for the 4K decode/encode.
- **platform@chrome-149** — NA_ENGINE (honest). Its only transcode path is `<video>→canvas→MediaRecorder`, which cannot preserve/copy the source's AAC audio track; since the fixture carries audio, the adapter correctly declines (reason quoted in shard). Plausible runtime limitation, not under-declared.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare operation 'transcode'. Honest — web-demuxer is a demuxer only (no encoder/mux-transcode pipeline).
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'transcode'. Honest — mp4box is an ISOBMFF box parser/muxer with no codec encode path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'transcode'. Honest — it is a parser; encode lives in the separate remotion-webcodecs package (which does compete here).

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:189-201` (id `h264_resize_4k_to_1080p`, asset `h264_4k_10s.mp4`, resize to 1920x1080 H.264/MP4, tolerances ssimMin 0.98 / psnrMinDb 38, notes "4K→1080p downscale").
- Fixture exists and is real media: `fixtures/media/h264_4k_10s.mp4`, 26 MB, ffprobe confirms `h264 3840x2160` video + `aac` audio, duration 10.0s. Not synthetic/empty/mock.
- Winner adapter genuinely implements the op: `src/engines/mediabunny/adapter.ts:1271-1322` (`transcode`) → builds Output/BufferTarget, `Conversion.init` (`adapter.ts:848`), `conversion.execute()` (`adapter.ts:855`). No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (it rejects bad dims at `adapter.ts:1276-1281` and throws on missing tracks at `adapter.ts:1294-1299`). Output bytes go through a real BufferTarget and are then re-decoded by the SSIM oracle.
- Gating oracle: `src/core/oracles.ts:1688` (`ssimPsnr`). It re-decodes the engine's output bytes with the platform decoder, pairs 12 frames against golden luma signatures (`oracles.ts:1748-1790`), and gates on worst-frame SSIM >= ssimMin (`oracles.ts:1823`). Measurements (pairs 12, ssimMin ~0.99998) are physically plausible for a high-quality 4K→1080p downscale. Reference-source fallback path (`oracles.ts:1842`) exists for golden-less cases and computes real SSIM/PSNR on decoded pixels.
- Caveat on gate strength: `exactFrames == 0` for all engines and the detail says "PSNR via golden pixels unavailable (digest proxy)". This is a perceptual-proxy gate (SSIM on downsampled luma signatures), not bit-exact — per the correctness ladder it is a WEAKER oracle, plus a smoke. The PASS is real and discriminating (the doc at `oracles.ts:1916-1919` notes a wrong frame scores ~0.84 vs ~0.99 correct), but it is not a bit-exact correctness proof.
- Cached note: all 3 PASS results have `cached: true` ("cached previous PASS result"). The winner's numbers were reused, not re-run this session — staleness risk exists, but inputs/oracle/adapter are unchanged and consistent.

Verdict: **REAL** (with a WEAK-GATE caveat). Real fixture + real WebCodecs Conversion implementation + a meaningful (though perceptual-proxy, n==1) SSIM oracle. The win is a clean, large, internally-consistent performance margin on identical correctness.

## Confidence & caveats

- Confidence: **high** on the winner. The perf margin is enormous and consistent across wall/throughput/encodeFps (4.04x over runner-up, 45.2x over third); ranking is robust even at n==1.
- All bench samples are `n==1` (single timed run, mad==0, p95==median) — absolute timings carry single-sample variance, but the 4x/45x ratios are far larger than any plausible noise, so the ordering is safe.
- `peakMemory` and `decodeFps` are not measured (n==0) for any engine, so the memory/decode tiebreakers could not be applied (and were not needed).
- Correctness is a true tie among the 3 PASS engines; the decision rests entirely on performance per the decision procedure. The gate is perceptual proxy (exactFrames==0), so this is "best performant correct-enough transcoder," not "bit-exact verified."
- All winner numbers come from a cached result; a fresh re-run is advisable before publishing if the launcher seeding/stale-PASS caveat applies.
