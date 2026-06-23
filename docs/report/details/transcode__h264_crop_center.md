# transcode/h264_crop_center

**family:** transcode | **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264/AAC in MP4) | **primaryMetric:** throughputRealtime | **passCount:** 2 of 7

Operation: center-crop transcode of a 1920×1080 H.264 source to a 1440×810 box offset at (240,135), re-encoded to H.264 in MP4 (`crop: { x:240, y:135, width:1440, height:810 }`, `video: { codec:'h264', width:1440, height:810 }`).

## Verdict

**Best framework: mediabunny@1.48.0 — CONTESTED win (2 engines PASS).**

Both PASS engines (mediabunny, ffmpeg.wasm) satisfy the identical oracle set (`ssim-psnr` + `property-invariant` + `playback-smoke`) at the same strictness tier, so correctness is comparable at the gate. mediabunny wins on the next ladder rung — **performance** — by a crushing margin, and additionally has the better SSIM.

- **Decisive factor:** wall/throughput. mediabunny ran the crop transcode in **1986.6 ms** vs ffmpeg.wasm's **63982.2 ms** — **32.2× faster wall**, **32.2× higher throughputRealtime** (15.10× vs 0.469× realtime), **32.2× higher encodeFps** (453.0 vs 14.07 fps). It also produced a tighter crop: **SSIM mean 0.9904 (min 0.9888)** vs ffmpeg.wasm's **0.9374 (min 0.9368)** against the same transform-aware reference.
- **Margin over runner-up (ffmpeg.wasm):** ~32× on every time/throughput metric; SSIM mean +0.053 absolute. Caveat: both benches are **n==1** (single sample, mad=0), so timing is point-estimate evidence — but a 32× gap is far beyond any plausible single-run variance.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | ssim-psnr:✓ property-invariant:✓ playback-smoke:✓ | 1986.6 ms | 15.101× | 0 (not sampled) | 4410 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:✓ property-invariant:✓ playback-smoke:✓ | 63982.2 ms | 0.469× | 0 (not sampled) | 632 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'crop' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'crop' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

**Codec/container path.** The source is H.264 high-profile in MP4 (with an AAC audio track). The scenario decodes the coded 1920×1080 frames, spatially crops a 1440×810 window at offset (240,135), and re-encodes to H.264 in MP4. The two passing engines reach a correct result by completely different machinery.

**mediabunny — hardware WebCodecs, lockstep streaming.** From `env.configUsed`: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `pixelBackend: "VideoSample.copyTo(RGBA)>canvas"`, `wasmThreads: 0`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`. The crop is wired through mediabunny's native `Conversion` API rather than a manual decode/draw loop: the adapter normalizes the crop knob into `ConversionVideoOptions.crop = { left, top, width, height }` at `src/engines/mediabunny/adapter.ts:558-572` (it accepts either `x/y` or `left/top`, here left=240, top=135, w=1440, h=810), and because both width and height are set it lets mediabunny pick the fit algorithm. Encode acceleration is chosen by probing `VideoEncoder.isConfigSupported` in priority order `[prefer-hardware, no-preference, prefer-software]` (`adapter.ts:622-657`), so on the Apple M1 Max (ANGLE Metal) it lands on the hardware H.264 encoder. The decode→crop→encode stays on the GPU/media engine, which is why it finishes in ~2 s at 453 encodeFps — 15× faster than realtime.

The win is also a *quality* win, not just a speed win. The `ssim-psnr` oracle here takes the transform-aware reference path (`ssimVsReferenceSource`, `src/core/oracles.ts:1842`): there is no committed golden for a crop transcode, so the oracle decodes the SOURCE in-browser and applies the *same* crop to the reference via `prepareReferenceImage` (`oracles.ts:1938-1948`, `cropImageData(ref, 240,135,1440,810)`), then computes per-frame SSIM over 8 frames. mediabunny scored **ssimMean 0.9903563763858725, ssimMin 0.9887503972371018, psnrDb 31.72 (advisory)** over 8 pairs — extremely close to the reference cropped pixels, consistent with a hardware H.264 encode of an exact pixel-window crop. `property-invariant` (transcode-output-metadata, `oracles.ts:3631`) confirmed the output is `mp4` with 1 video track and **durationDeltaSec 0.08 s ≤ 0.15 s tolerance**, i.e. the crop did not desync the timeline. `playback-smoke` confirmed a real `<video>` decoded the output.

**Why ffmpeg.wasm loses despite passing.** ffmpeg.wasm reaches the same correct shape via `-vf crop` and `libx264` (feature declared at `src/engines/ffmpeg-wasm/adapter.ts:1487`, `crop` → `-vf crop`), but runs single-thread wasm software encode. Its bench shows **wall 63982.2 ms, throughputRealtime 0.469× (slower than realtime), encodeFps 14.07** — a 32× deficit driven entirely by software libx264 vs the M1 hardware encoder. Its SSIM is also lower (**ssimMean 0.9374, ssimMin 0.9368, psnrDb 29.50**), sitting just above the 0.93 floor; the lower SSIM is consistent with software libx264 at the chosen bitrate producing more deviation from the canvas-cropped reference than the hardware path. It still PASSes every oracle (durationDeltaSec 0), so it is a legitimate but decisively slower and slightly less faithful runner-up.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed all 3 oracles but lost on performance: 63982.2 ms wall (32.2× slower), 0.469× realtime throughput (32.2× lower), 14.07 encodeFps (32.2× lower) than mediabunny, plus a lower SSIM (0.9374 vs 0.9904). Cause: single-thread wasm software libx264 encode vs mediabunny's hardware WebCodecs encoder on the M1 Max.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'crop'". Honest NA — the bare-WebCodecs platform adapter exposes decode/encode but no spatial-transform (crop) op, so it cannot satisfy the `features: ['crop']` requirement.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'crop'". Honest NA — supports transcode but has not declared the crop capability token.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — a parser/demuxer, no encode/transcode op at all.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — a box-level MP4 muxer/parser, no pixel decode/encode.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — demux-only library.

## Anti-cheat validation

**Verdict: REAL.**

- **Scenario definition:** `src/scenarios/transcode/index.ts:726-743` (case `h264_crop_center` in `TRANSFORM_FEATURE_CASES`), materialized at `index.ts:783-803` with `input: 'h264_1080p_30s.mp4'`, `op: 'transcode'`, `requires.features: ['crop']`, oracles `['ssim-psnr','property-invariant','playback-smoke']`, tolerances `ssimMin: 0.93`.
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4`, 31 MB real H.264/AAC MP4 (not synthetic/empty/mock). The crop reference is derived by decoding this same file in-browser.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:558-572` maps the crop into `ConversionVideoOptions.crop`; `adapter.ts:622-657` probes and selects a real hardware WebCodecs encoder. No canned output, no input→output copy, no short-circuit to a golden, no error-swallowing — the result flows through the real mediabunny `Conversion` pipeline and is independently re-decoded by both the SSIM and playback oracles.
- **Oracle is meaningful:** `ssim-psnr` reference path `src/core/oracles.ts:1842-1925`; the reference is the SOURCE cropped identically via `prepareReferenceImage`/`cropImageData` (`oracles.ts:1938-1948`), gated on SSIM mean ≥ 0.93. This is a real pixel comparison against a transform-aware reference, not a smoke gate. measurements are physically plausible: 8 frame pairs, SSIM 0.9904 (mediabunny) / 0.9374 (ffmpeg), PSNR ~30-32 dB — exactly the range expected for a lossy H.264 re-encode of cropped frames. `property-invariant` (`oracles.ts:3631`) re-probes the output container/track-count/duration via a reference engine (durationDelta 0.08s within 0.15s). Note: this reference SSIM path does NOT emit `exactFrames` (it is a perceptual-proxy gate by design, since a re-encode is never bit-exact), so the win rests on a proxy oracle rather than a bit-exact one — but it is a genuine, discriminating proxy (the comments at `oracles.ts:1915-1919` document ~0.99 for correct vs ~0.84 for wrong frames).
- **Cached note:** BOTH passing engines have `cached: true` ("cached previous PASS result"). The evidence was reused, not freshly re-run, so there is staleness risk — but the per-engine env, oracle measurements, and benches are all present and internally consistent.

## Confidence & caveats

**Confidence: high** that mediabunny is the correct winner. The 32× performance margin is decisive and far exceeds single-run noise, correctness is co-equal at the gate (with mediabunny additionally ahead on SSIM), and the only other capable engine (ffmpeg.wasm) is structurally slower (wasm software encode).

Caveats: (1) both benches are **n==1** (mad=0, single sample) — timing is a point estimate, though the 32× gap dwarfs any plausible variance. (2) Both results are **cached** — a fresh re-run is advisable to rule out staleness, per the launcher seeding caveat. (3) `peakMemory` and `decodeFps` were not sampled (n=0) for either engine, so the comparison rests on wall/throughput/encodeFps. (4) The gating oracle is a perceptual SSIM proxy (no bit-exact frame check, expected for a lossy re-encode), classifying this as REAL-but-proxy rather than crypto/bit-exact strength.
