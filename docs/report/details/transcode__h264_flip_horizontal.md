# transcode/h264_flip_horizontal

- family: transcode
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (real H.264/AVC in MP4, 1920x1080, ~30s, 31,258,790 bytes)
- primaryMetric: wall (see TC_METRICS)
- passCount: 1 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Contested: **No** — uncontested. Exactly one engine reached PASS; the other six are honest NA_ENGINE.
- Decisive factor: ffmpeg.wasm is the only adapter that *declares* the `flip` feature token AND the `transcode` operation, so it is the only engine the runner even attempts to gate. It then actually applied the horizontal flip in the encode pipeline (`-vf hflip`) and passed the transform-aware SSIM gate (SSIM mean 0.9996, min 0.9995 vs flip 0.97 gate) plus playback-smoke.
- Margin over runner-up: not applicable (no second PASS). All other six engines short-circuit at capability gating (NA), never producing output.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true, playback-smoke:true | 76690.23 ms | 0.3912 x-rt | 0 (n=0, not sampled) | 315 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flip' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flip' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flip' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Bench extras for the winner: encodeFps median 11.74 fps (n=1), decodeFps not sampled (n=0), peakMemory not sampled (n=0). All winner metrics are single-sample (n=1, mad=0) because the value was reused from a cached PASS.

## Why the winner wins (deep technical)

This row is a spatial-transform transcode: take real upright H.264-in-MP4 (1920x1080), decode, apply a horizontal mirror, re-encode H.264 back into MP4, and prove the output is a true left-right flip of the source. The scenario (`src/scenarios/transcode/index.ts:783-803`) builds it from `TRANSFORM_FEATURE_CASES` (`index.ts:713-719`) with `input: 'h264_1080p_30s.mp4'`, `options.flip: 'h'`, and `requires.features: ['flip']`. The gate is `['ssim-psnr','playback-smoke']` with tolerances `ssimMin: 0.97, psnrMinDb: 36`.

Capability declaration is the whole game here. The runner only attempts an engine if it declares both the `transcode` operation and the required `flip` feature; otherwise it emits NA_ENGINE without running. ffmpeg.wasm declares `flip` in its feature list (`src/engines/ffmpeg-wasm/adapter.ts:1486`, comment `// -vf hflip/vflip`) and implements `transcode`. No other engine declares `flip` (three of the six fail on `feature 'flip'`; the other three do not even declare the `transcode` op).

Mechanistically, the flip is real, not faked. In the transcode path the adapter assembles an ffmpeg filtergraph and, for `flip === 'h'`, pushes `hflip` onto the `-vf` chain (`adapter.ts:2312-2314`), then joins the filters into `-vf <chain>` (`adapter.ts:2372`). The decode→filter→re-encode therefore runs through the real libavfilter `hflip` filter inside the WebAssembly ffmpeg build — the source is genuinely decoded to YUV, mirrored, and re-encoded to H.264. (The adapter also lowers the spatial-transform CRF for fidelity: `const spatialTransformCrf = crop || pad || flip ? '6' : '12'` at `adapter.ts:2435`, which is why the output is near-lossless against the flipped reference.)

The oracle is correspondingly transform-aware, which is what makes the PASS meaningful rather than vacuous. `ssimPsnr` (`src/core/oracles.ts:1688`) detects this is a transform case via `usesTransformReference` (`oracles.ts:1973-1976`, true because `options.flip` is a string), so instead of comparing against a committed golden it decodes the SOURCE in-browser and builds a *flipped* reference. In `prepareReferenceImage` it reads `flip` from options and calls `flipImageData(ref, 'h')` (`oracles.ts:1950-1953`), which mirrors the reference horizontally via an OffscreenCanvas `scale(-1,1)` transform (`oracles.ts:2028-2042`). It then computes per-frame SSIM (`ssim()`) between the candidate's decoded output pixels and that flipped reference, over 8 sampled frames (`ssimVsReferenceSource`, `oracles.ts:1842-1914`).

The measured result confirms a correct flip: `pairs: 8, ssimMean: 0.99964, ssimMin: 0.99955, psnrDb: 55.44 dB`. SSIM mean 0.9996 is the GATE and clears 0.97 with enormous headroom; PSNR 55.4 dB is reported as advisory only because the reference is downscaled with a different resampler (OffscreenCanvas) than the candidate, so absolute PSNR is not directly comparable (`oracles.ts:1915-1916`). Critically, if ffmpeg had *not* actually mirrored the frame, the candidate would match the un-flipped source and mismatch the flipped reference, collapsing SSIM far below 0.97 — so the high SSIM is positive evidence of a real horizontal flip, not just "some plausible video." playback-smoke additionally confirmed the output MP4 decodes and plays frames in a real `<video>` element. Backend: single-thread wasm ffmpeg on Chromium 149 (Apple M1 Max host); wall 76.7s and encodeFps 11.7 reflect software decode+filter+encode of the full clip, the expected cost of a wasm transcode with no hardware path.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'flip'". Honest NA. mediabunny supports WebCodecs transcode but does not expose a flip/transform knob, so it cannot mirror frames; declining is correct rather than under-declared for *this* spatial transform.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'flip'". Honest NA. The raw WebCodecs platform adapter has no flip filter primitive (a flip would require manual VideoFrame canvas-draw + re-encode that the adapter does not implement). Correct decline.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'flip'". Honest NA. It does WebCodecs transcode but does not declare the flip transform.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA. mp4box.js is a demux/remux/box-parser library with no decode/encode pipeline; it cannot transcode at all, let alone flip pixels.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA. web-demuxer only demuxes packets; no encode path exists.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA. It is a parser/probe library, not a transcoder.

None of the NAs look like under-declared capabilities for a horizontal flip: only ffmpeg.wasm ships a libavfilter `hflip`-equivalent transform path among these seven.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:713-719` (case) and `:783-803` (builder). Input field `input: 'h264_1080p_30s.mp4'`, `flip: 'h'`, gate `ssim-psnr` + `playback-smoke`, tolerance `ssimMin 0.97`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` — exists, 31,258,790 bytes, real H.264/AVC 1080p MP4. Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:1688` (`ssimPsnr`), transform branch `:1973-1976` (`usesTransformReference`), reference build `:1842-1914`, flip applied to reference `:1950-1953` + `flipImageData :2028-2042`. The oracle decodes the real source, mirrors it, and runs real per-frame SSIM; it is NOT trivially satisfiable — a non-flipped output would fail.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:1486` (declares `flip`), `:2312-2314` (`hflip` pushed to filtergraph), `:2372` (`-vf` applied), `:2435` (CRF lowered for transforms). Genuine libavfilter call inside wasm ffmpeg; no canned output, no input→output copy, no golden short-circuit.
- Measurements physically plausible: 8 paired frames, SSIM 0.9996/0.9995, PSNR 55.4 dB, wall 76.7s, encodeFps 11.7 — consistent with a real full-clip wasm transcode.
- Cached note: the winner result has `cached:true` ("cached previous PASS result"), so the numbers were reused, not re-run this batch. Staleness risk is low (implementation + oracle are real and unchanged), but the bench figures are single-sample reuse.

Verdict: **REAL** — real fixture + genuine `hflip` libavfilter implementation + transform-aware SSIM oracle that mirrors the reference before comparison. The PASS reflects an actual, correctly-flipped H.264 transcode.

## Confidence & caveats

- Confidence: high. The winner is the only eligible engine, the oracle genuinely models the flip, and the SSIM (0.9996 vs 0.97) is far above gate with a sane PSNR.
- Caveats: (1) the gate is perceptual SSIM, not bit-exact, and `exactFrames`/digest-equality is effectively 0 for a re-encoded transform (PSNR is advisory due to cross-resampler reference) — so this is a strong perceptual gate, not a cryptographic one. (2) Result is `cached:true`; all winner metrics are n=1, mad=0 single-sample, so performance evidence is weak/stale. (3) Uncontested: no comparative ranking is possible because no second engine produced output.
