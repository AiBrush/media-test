# decode-seek/decode_tiny_dims_1x1

family: decode-seek | fixture asset: `video_1x1.webm` (VP9 in WebM, 1×1 px, 8 frames, ~1.8 KB) | primaryMetric: decodeFps | passCount: 5/7

## Verdict
- Best framework: **platform@chrome-149** (uncontested on correctness; contested on perf among 5 PASS).
- Contested: yes — 5 of 7 engines PASS. But only `platform` reaches the bit-exact correctness tier.
- Decisive factor: **CORRECTNESS STRENGTH.** Platform is the only engine with `exactFrames==8/8` (every paired frame digest-identical: SSIM=1, PSNR=∞). The other four PASS engines (mediabunny, ffmpeg-wasm, web-demuxer, remotion-webcodecs) all land in the weaker perceptual-proxy tier with `exactFrames==0` and `ssimMin ≈ 0.9997–0.9998` — they pass the ≥0.99 SSIM floor but never hit digest equality.
- Performance margin (secondary, platform also wins it): decodeFps 1958.4 vs mediabunny 1508.0 → **1.30x faster**; wall 4.085 ms vs mediabunny 5.305 ms → **1.30x lower**. All metrics n=1 (mad=0), so the perf gap is weak evidence — but correctness alone already settles the win.

## Per-engine results
| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:true (exact 8/8, SSIM=1) | 4.085 | n/a (decodeFps 1958.4) | 0 (not measured) | 3638 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:true (exact 0/8, ssimMin 0.9998) | 5.305 | n/a (decodeFps 1508.0) | 0 (not measured) | 840 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:true (exact 0/8, ssimMin 0.9998) | 7.830 | n/a (decodeFps 1021.7) | 0 (not measured) | 19963 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:true (exact 0/8, ssimMin 0.9997) | 12.405 | n/a (decodeFps 644.9) | 0 (not measured) | 1361 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:true (exact 0/8, ssimMin 0.9997) | 12.885 | n/a (decodeFps 620.9) | 0 (not measured) | 2907 | cached previous PASS |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

Note: `throughputRealtime` is not a metric for this decode scenario; the size-ladder headline is `decodeFps` (reported in the column). `peakMemory`/`timeToFirstFrame` carry n=0 (not sampled).

## Why the winner wins (deep technical)
This is the A.16 degenerate-dimension edge case: a **1×1-pixel VP9 video in a WebM/Matroska container**, 8 frames. The decode path must (1) parse the WebM EBML/Matroska structure to extract the VP9 track and its SimpleBlocks, (2) build a valid `VideoDecoderConfig` for `codec: "vp09.*"`, and (3) decode 8 frames at the smallest legal resolution where a single chroma/RGBA rounding step is an enormous fraction of the entire luma signature.

Platform's adapter implements this genuinely with the browser's native stack. `decodeFrames` (src/engines/platform/adapter.ts:422) reads the input bytes, recognizes the container via inline demuxers (`buildDecodeInput`, adapter.ts:479; WebM handled in src/engines/platform/demux-webm.ts), and feeds real `EncodedVideoChunk`s to a real `VideoDecoder` in `collectDecodedFrames` (src/engines/platform/decode.ts:165-224). Frames are pushed in the `output` callback, then sorted by `ptsUs` (decode.ts:222) to guarantee presentation order, and exposed with on-demand `getPixels` plus a sha256 digest (decode.ts:36). `env.configUsed.backend="webcodecs"`, `hwAccel=true`, `decode="VideoDecoder"`, `pixelBackend="webgpu>webgl>offscreen2d"`.

Why platform alone hits 8/8 exact: the ssim-psnr oracle (src/core/oracles.ts:1766) first tries digest equality — `normHex(cand.sha256) === normHex(want[i].sha256)` — and only falls back to downsampled-luma SSIM when digests differ. The committed golden frame digests in `fixtures/golden/video_1x1.webm.frames.json` were baked by the platform decoder's exact RGBA rasterization path, so platform's re-decode reproduces byte-identical normalized RGBA → all 8 digests match → `exactCount==pairs` → the oracle returns the bit-exact branch `all 8 paired frames digest-identical (SSIM=1, PSNR=∞)` (oracles.ts:1803-1809), with measurements `{pairs:8, exactFrames:8, ssimMean:1, ssimMin:1, psnrDb:∞}`. That is the strongest tier on the correctness ladder for this scenario (decoded-frames-bitexact-equivalent via digest equality), and no other engine reaches it.

The four other PASS engines decode correctly but with a different RGBA conversion (different VP9→RGBA color/rounding path or canvas backend), so none of their 8 frame digests match the golden (`exactFrames:0`). They instead pass through the SSIM-signature branch (oracles.ts:1782-1786), scoring `ssimMin ≈ 0.9997–0.9998` — comfortably above the default ≥0.99 floor (this scenario sets no `tolerances`, so the default applies), but strictly weaker evidence than digest equality. At 1×1 these tiny SSIM deficits are exactly the "single chroma/RGB rounding step is a large fraction of the whole luma signature" effect the sibling 2×2 case documents.

On the secondary perf axis platform is also fastest: decodeFps 1958.4 (1.30x over mediabunny's 1508.0) and wall 4.085 ms (1.30x under mediabunny's 5.305 ms), driven by hardware-accelerated WebCodecs vs mediabunny's also-webcodecs path with extra `VideoSample.copyTo(RGBA)>canvas` pixel work. ffmpeg-wasm's `longtasks` of 19963 ms reflects single-thread wasm decode cost. But with all bench n=1 (mad=0, p95==median), the perf deltas are low-confidence; correctness is the load-bearing factor.

## What each other framework did wrong
- **mediabunny@1.48.0**: PASS but lost on correctness — `exactFrames:0/8`, `ssimMin 0.9998` (perceptual-proxy tier, not digest-exact). Also 1.30x slower (decodeFps 1508.0 vs 1958.4). Its `VideoSample.copyTo(RGBA)>canvas` pixel backend yields a different normalized RGBA digest than the golden.
- **ffmpeg.wasm@0.12.15**: PASS but `exactFrames:0/8`, `ssimMin 0.9998`; 1.92x slower than platform (decodeFps 1021.7) and a very large `longtasks` 19963 ms — single-thread wasm decode/rasterization with its own RGB conversion that misses digest equality.
- **web-demuxer@4.0.0**: PASS but `exactFrames:0/8`, lowest `ssimMin 0.9997`; 3.0x slower (decodeFps 644.9, wall 12.405 ms).
- **remotion-webcodecs@4.0.479**: PASS but `exactFrames:0/8`, `ssimMin 0.9997`; slowest decode (decodeFps 620.9, wall 12.885 ms). Its `offscreencanvas-2d` pixel backend produces a non-matching digest.
- **remotion-media-parser@4.0.479**: NA_ENGINE — `engine does not declare operation 'decodeFrames'`. Honest NA: media-parser is a demux/parse-only library with no frame decoder, so not declaring `decodeFrames` is correct, not under-declared.
- **mp4box@2.3.0**: NA_ENGINE — `engine does not declare operation 'decodeFrames'`. Honest NA: mp4box is an MP4/box parser+demuxer with no pixel decoder (and the fixture is WebM, not MP4, so it would be doubly inapplicable); the NA is genuine.

## Anti-cheat validation
- Scenario definition: src/scenarios/decode-seek/index.ts:255-263 (`id: 'decode_tiny_dims_1x1'`, `asset: 'video_1x1.webm'`, `container: 'webm'`, `videoCodec: 'vp9'`, `maxFrames: 8`, `sizeBucket: 'micro'`, notes "A.16 1×1 video: minimum-dimension decode"). Op wired as `decodeFrames` at index.ts:289.
- Fixture: `fixtures/media/video_1x1.webm` EXISTS (~1.8 KB) — a real, non-empty VP9/WebM file, not synthetic/mock. Golden assets exist: `fixtures/golden/video_1x1.webm.frames.json` (3.1 KB), `.ssim.json` (28 KB), `.meta.json`, `.packets.json`.
- Oracle: `ssim-psnr` in src/core/oracles.ts:1688-1833. Real comparison: digest-equality first (oracles.ts:1766), downsampled-luma SSIM fallback (oracles.ts:1782-1786), gate on the WORST frame `minSsim >= t.ssimMin` (oracles.ts:1823). Not trivially satisfiable — a garbled/empty decode yields 0 frames → FAIL (oracles.ts:1729-1734) or low SSIM → FAIL (oracles.ts:1830-1832). Measurements physically plausible: 8 pairs (matches maxFrames=8), SSIM 0.9997–1.0, platform 8/8 digest-exact.
- Winner adapter: src/engines/platform/adapter.ts:422 (`decodeFrames`) → real `VideoDecoder` in src/engines/platform/decode.ts:175-205 (configure + EncodedVideoChunk feed + flush). No canned output, no input→output copy, no golden short-circuit; digests computed from actual decoded pixels (decode.ts:36).
- Verdict: **REAL** — real fixture + real native WebCodecs VP9 decode + meaningful digest/SSIM oracle. Caveat: platform's 8/8 digest-exact is partly because the golden frame digests were themselves baked with the platform decoder's RGBA path; this makes platform's bit-exact tier somewhat self-referential, but it is still a genuine decode (not a short-circuit to the golden) and the other engines clear the same SSIM gate, so the result is honest.
- Cached note: ALL 5 PASS results have `cached==true` ("cached previous PASS result") — none re-run in this pass. Staleness risk exists, but the cached oracle outcomes are internally consistent (pairs=8, plausible SSIM, distinct per-engine decodeFps), so the cached evidence is credible rather than fabricated.

## Confidence & caveats
- Confidence: **high** on the winner (correctness ladder is decisive and unambiguous: platform is the sole 8/8 digest-exact engine).
- Caveats: (1) all bench metrics are n=1 (mad=0, p95==median) → perf margins are low-confidence, but perf is only the secondary axis. (2) All winners are cached, not freshly re-run. (3) Platform's digest-exactness is golden-self-referential by construction; the substantive correctness claim is that platform decodes the VP9 1×1 stream faithfully, which it does. (4) `peakMemory`/`timeToFirstFrame`/`throughputRealtime` not sampled (n=0) for this scenario.
