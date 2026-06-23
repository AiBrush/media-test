# transcode/h264_resize_720p

- family: transcode
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (real, 31 MB H.264/AAC in MP4)
- operation: downscale-transcode 1080p -> 1280x720, H.264-in-MP4 -> H.264-in-MP4
- primaryMetric: throughputRealtime (x-realtime); wall median reported alongside
- passCount: 3 of 7 (mediabunny, remotion-webcodecs, ffmpeg-wasm)

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- Contested: YES — 3 engines PASS, all with statistically identical correctness (SSIM min ~1.0000, gate 0.97).
- Decisive factor: PERFORMANCE. Correctness is a tie, so the win is on speed/throughput.
- Margin over runner-up (remotion-webcodecs): **2.53x faster wall** (1794.1 ms vs 4547.5 ms),
  **2.53x higher throughputRealtime** (16.72x vs 6.60x), **2.53x higher encodeFps** (501.6 vs 197.9).
  Against ffmpeg-wasm the gap is **31.9x faster wall** (1794.1 ms vs 57160.2 ms) and **31.9x throughput**
  (16.72x vs 0.52x realtime). Caveat: n==1 sample per engine (mad=0, p95==median), so the margin is a
  single-run point estimate; the >2.5x and >30x gaps are far larger than plausible single-run jitter, so
  the ranking is robust even at n==1.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:pass, playback-smoke:pass | 1794.125 | 16.721 | n/a (0 samples) | 2244 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass, playback-smoke:pass | 4547.525 | 6.597 | n/a (0 samples) | 874 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, playback-smoke:pass | 57160.235 | 0.525 | n/a (0 samples) | 179 | cached previous PASS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: source carries audio; MediaRecorder canvas-capture path cannot preserve/copy audio |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

SSIM detail per PASS engine (oracle `ssim-psnr`, 12 paired frames each):
- mediabunny: ssimMin 0.99998510, ssimMean 0.99998632, exactFrames 0/12
- remotion-webcodecs: ssimMin 0.99996596, ssimMean 0.99997961, exactFrames 0/12
- ffmpeg-wasm: ssimMin 0.99996889, ssimMean 0.99997499, exactFrames 0/12

## Why the winner wins (deep technical)

This is a re-encode (resize), not a remux: every frame of the 1080p source must be decoded, scaled to
1280x720, and re-encoded as H.264, then muxed into MP4. The work is therefore dominated by the
decode+scale+encode pixel pipeline, and the framework that pins that pipeline to the GPU/hardware video
engine wins.

mediabunny ran on `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`,
`pixelBackend: VideoSample.copyTo(RGBA)>canvas`, `coopCoep: not-required`, `sharedArrayBuffer: false`
(from env.configUsed). Its transcode is a thin wrapper over mediabunny's `Conversion` object:
`adapter.ts:1271` (`transcode`) builds a single fresh `Input`/`Output` pair, derives video options via
`buildVideoOptions` for the requested 1280x720, and delegates to `runConversion`
(`src/engines/mediabunny/adapter.ts:842`), which calls `Conversion.init(opts)` (line 848), checks
`conversion.isValid` / `discardedTracks`, then `conversion.execute()` (line 855). The library's Conversion
drives a hardware `VideoDecoder`/`VideoEncoder` lockstep with backpressure, and the adapter forces
`hardwareAcceleration: 'prefer-hardware'` on the encode path (`adapter.ts:604`). On the Apple M1 Max
(ANGLE Metal renderer) this lands on the platform H.264 hardware encoder. Result: encodeFps 501.6,
throughput 16.72x realtime, wall 1794 ms. The high longtasks (2244 ms) reflect main-thread copyTo/canvas
readback work, but it does not bottleneck wall time because the heavy codec work is offloaded to hardware.

remotion-webcodecs is also WebCodecs-backed and also passes correctness (SSIM min 0.99997), but it ran
`pixelBackend: offscreencanvas-2d`, `pipeline: streaming-backpressure`,
`hwAccel: prefer-hardware(+software fallback)`, `writer: bufferWriter`, `worker: convert=main-thread`.
It is 2.53x slower (4547 ms, 197.9 encodeFps). Two mechanistic costs: (1) the convert pipeline runs on the
main thread (per its config), and (2) the offscreencanvas-2d pixel path plus its software-encode fallback
contingency add per-frame overhead versus mediabunny's direct VideoSample.copyTo(RGBA) lockstep. Its lower
longtasks (874 ms) shows its per-task chunks are smaller, but total wall is worse because throughput is
lower — it is doing more total work per frame.

ffmpeg.wasm is the correctness equal (SSIM min 0.99997) but a pure software codec: it has NO WebCodecs and
NO hardware path. It runs libx264 + the swscale `scale=` filter entirely in single-thread WASM
(`wasmThreads: 0`; the `scale=` filter string is built at `src/engines/ffmpeg-wasm/adapter.ts:193`, and the
transcode entry is `adapter.ts:2165`). Decoding 1080p, scaling, and CPU-encoding H.264 in one WASM thread
costs 57.2 s — 0.52x realtime, i.e. slower than real time. Its longtasks are tiny (179 ms) only because the
WASM run is one long synchronous blob inside ffmpeg, not because it is efficient. It is 31.9x slower than
mediabunny on wall and throughput.

Net: among three correct transcodes, mediabunny's hardware-WebCodecs lockstep with a direct RGBA copy path
is the fastest by 2.53x over the next WebCodecs engine and 31.9x over the WASM software encoder.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed (correct) but lost on speed: 4547.5 ms wall vs 1794.1 ms
  (2.53x slower), 6.60x vs 16.72x throughput, 197.9 vs 501.6 encodeFps. Cause: main-thread convert +
  offscreencanvas-2d pixel path + software-fallback-capable encoder add per-frame overhead vs mediabunny's
  direct VideoSample.copyTo(RGBA) hardware lockstep.
- **ffmpeg.wasm@0.12.15** — PASSed (correct) but lost catastrophically on speed: 57160.2 ms wall
  (31.9x slower), 0.52x realtime, 15.7 encodeFps. Cause: single-thread WASM libx264 software encode +
  swscale, no hardware/WebCodecs path (`wasmThreads: 0`).
- **platform@chrome-149** — NA_BROWSER-style NA (reported NA_ENGINE with a capability reason): its only
  transcode path is `<video> -> canvas -> MediaRecorder`, which captures video frames but cannot carry the
  source's AAC audio track. The fixture has audio, so platform honestly declines rather than silently
  dropping audio. NA looks HONEST and well-reasoned (durationMs 8 — it bailed in the capability check).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest; web-demuxer
  is a demux-only library (libavformat in WASM) with no encoder.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest;
  it is a parser, not a transcoder.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest; MP4Box.js is a
  box-level (de)muxer with no codec.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:176` (id `h264_resize_720p`), asset
  `h264_1080p_30s.mp4`, `features: ['resize']`, opts `{ container: 'mp4', video: { codec: 'h264',
  width: 1280, height: 720 } }`, tolerances `{ ssimMin: 0.97, psnrMinDb: 36 }`, notes "Downscale
  1080p->720p; SSIM computed against reference 720p frames."
- Fixture exists: `fixtures/media/h264_1080p_30s.mp4`, 31 MB, real H.264/AAC MP4 (not synthetic/empty).
- Winner adapter: real implementation. `src/engines/mediabunny/adapter.ts:1271` (`transcode`) ->
  `runConversion` `adapter.ts:842` -> `Conversion.init`/`conversion.execute()` lines 848/855, forcing
  hardware encode at `adapter.ts:604`. No canned output, no input->output copy (a resize cannot be a copy;
  output is genuinely re-encoded at 1280x720), no short-circuit to a golden, no error-swallowing
  (invalid Conversion throws at line 851).
- Gating oracle: `ssim-psnr` at `src/core/oracles.ts:1688`. For this resize (no crop/pad/flip, so
  `usesTransformReference` at line 1973 returns false), there IS a committed golden
  `fixtures/golden/h264_1080p_30s.mp4.ssim.json` (76 KB of per-frame luma signatures), so the oracle takes
  the `haveGolden` branch: it pairs the candidate's decoded 720p frames against those signatures using
  resolution-independent `downsampleLuma` (line 4048) + `sigSsim` (line 4075) and gates on the WORST frame
  `minSsim >= 0.97` (line 1823). Measurements are plausible: 12 paired frames, SSIM ~0.99998 for a clean
  downscale. This is a REAL comparison, NOT trivially satisfiable — a wrong/mismatched frame would score
  far below 0.97 (the code comment at line 1918 notes a wrong frame scores ~0.84).
- Caveat on strength: this is a perceptual proxy, not bit-exact. `exactFrames` is 0/12 for all engines
  (no golden raw pixels committed, so PSNR is advisory and the gate rests on SSIM). The gate is real and
  discriminating, but it is the WEAKER (perceptual) rung of the correctness ladder, not bit-exact/crypto.
- cached: ALL THREE PASS results have `cached: true` ("cached previous PASS result"). Staleness risk: the
  numbers were reused, not re-run this session. The performance ranking direction (mediabunny << remotion
  << ffmpeg by large multiples) is structurally inevitable (hardware WebCodecs vs main-thread WebCodecs vs
  single-thread WASM), so caching does not threaten the WINNER selection, but the exact ms values should be
  treated as a prior snapshot.
- Verdict: **WEAK-GATE**. Real fixture + real hardware-WebCodecs implementation + a real, discriminating
  SSIM oracle — but the gate is perceptual (SSIM 0.97, exactFrames 0) rather than bit-exact, so the PASS is
  genuine but not the strongest possible class of evidence.

## Confidence & caveats

- Confidence: HIGH on the winner identity. Three engines genuinely transcode and pass; the performance gap
  (2.53x over the next WebCodecs engine, 31.9x over WASM) is far beyond single-run noise and is mechanistically
  explained by hardware vs software encode.
- Caveats: (1) n==1 per engine (mad=0), so absolute timings are point estimates. (2) All PASS results are
  cached — values are a prior-run snapshot. (3) peakMemory has 0 samples for all engines, so the memory
  tiebreaker is unavailable. (4) Correctness is a perceptual SSIM tie (~1.0000 for all three); no bit-exact
  evidence exists for this resize, so the contest is decided purely on speed. (5) platform's NA is honest
  (audio preservation limit), not an under-declared capability — note the related video-only resize scenario
  `video_only_h264_resize_360p_to_vp9_webm` exists specifically so platform can exercise its canvas->MediaRecorder
  path where there is no audio to lose.
