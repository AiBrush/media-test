# transcode/h264_pad_letterbox_4x3_to_16x9

- Family: transcode
- Fixture asset: `fixtures/media/h264_1080p_30s.mp4` (real, 31 MB H.264/AAC in MP4)
- primaryMetric: throughputRealtime (x-realtime); benches also report wall, encodeFps, longtasks
- passCount: 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (CONTESTED — 2 engines PASS).
- Decisive factor: **correctness strength on the gating `ssim-psnr` oracle.** ffmpeg.wasm scores SSIM mean 0.9997 / min 0.9996 / PSNR 55.7 dB vs mediabunny's SSIM mean 0.9923 / min 0.9857 / PSNR 41.4 dB. Per the decision ladder, correctness strength (4a) is evaluated before performance (4b); ffmpeg's letterbox output is measurably closer to the in-browser reference frames.
- Margin over runner-up (mediabunny): correctness +0.0074 SSIM mean, +0.0139 SSIM min, +14.3 dB PSNR (advisory). NOTE the opposite-sign performance margin is huge: mediabunny is ~28.3x faster on wall (3179.6 ms vs 90012.0 ms), ~28.3x higher throughput (9.435x vs 0.333x realtime), and ~28.3x higher encodeFps (283.1 vs 10.0 fps). This is a strong-correctness / slow vs adequate-correctness / fast tradeoff; the rubric breaks the tie toward correctness.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, playback-smoke:pass | 90012.025 | 0.3333 | 0 (n=0, not sampled) | 330 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass, playback-smoke:pass | 3179.635 | 9.4350 | 0 (n=0, not sampled) | 20101 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'pad' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'pad' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

**Operation.** This scenario re-encodes the 1080p H.264/MP4 source into an MP4 whose video track is padded/letterboxed into a 1920x1080 16:9 box (`extraOpts.pad = { width:1920, height:1080, color:'black' }`, `src/scenarios/transcode/index.ts:745-748`). A correct letterbox must scale the decoded source so its aspect ratio is preserved inside the target box and fill the remaining margin with black bars — geometry, not a plain re-encode. Both PASS engines implement this with the textbook approach.

**ffmpeg.wasm's path (winner).** The adapter builds an FFmpeg filtergraph `scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos` followed by `pad=1920:1080:(ow-iw)/2:(oh-ih)/2:<color>` (`src/engines/ffmpeg-wasm/adapter.ts:2329-2340`; feature declared at `:1488`). `force_original_aspect_ratio=decrease` is exactly the letterbox primitive — it fits the source inside 1920x1080 without distortion — and the centered `pad` expression `(ow-iw)/2,(oh-ih)/2` places black bars symmetrically. The video is then re-encoded with software libx264 (FFmpeg compiled to wasm, single-thread per `config`/`longtasks` profile). Because x264 software encode at the suite's target quality reproduces the scaled luma/chroma almost exactly, the SSIM against the OffscreenCanvas-derived reference is essentially unity: mean 0.9997, min 0.9996, PSNR 55.7 dB over 8 paired frames (shard `oracleOutcomes[ssim-psnr].measurements`). That is the cleanest correctness signal of any engine in this row.

**mediabunny's path (runner-up).** The adapter maps `pad` to `ConversionVideoOptions { width:1920, height:1080, fit:'contain' }` (`src/engines/mediabunny/adapter.ts:574-577`; feature declared at `:1060`). `fit:'contain'` is mediabunny's letterbox equivalent — it contains the source inside the box without stretching, leaving black margin — so the geometry is correct. The Conversion runs read→decode→encode→mux via `Conversion.init()/execute()` (`src/engines/mediabunny/adapter.ts:848-868`) on a WebCodecs hardware-accelerated H.264 encoder (`env.configUsed.backend='webcodecs'`, `hwAccel='prefer-hardware'`, M1 Max). Hardware encode at the chosen bitrate is slightly lossier than software x264, which is why its SSIM (mean 0.9923, min 0.9857, PSNR 41.4 dB) is lower — still comfortably above the 0.97 gate, but measurably below ffmpeg.

**Why ffmpeg wins the tie.** Both pass the identical oracle set (ssim-psnr gate + playback-smoke) at the same tier on the ladder (perceptual proxy). Within that tier, the rubric says "tighter measured tolerances win," and ffmpeg's gating-oracle numbers are uniformly tighter (+0.0139 on the worst frame, +14.3 dB PSNR). Correctness strength is ranked above performance, so ffmpeg takes the row.

**The cost.** This win is on a single sample (n=1 for every bench metric, mad=0) and is expensive: ffmpeg's single-thread wasm software encode runs at 0.333x realtime (90.0 s wall, 10.0 encodeFps) versus mediabunny's hardware WebCodecs pipeline at 9.435x realtime (3.18 s wall, 283.1 encodeFps) — a 28.3x throughput gap. The one place mediabunny looks worse on a perf axis is `longtasks` (20101 ms vs ffmpeg's 330 ms): mediabunny's main-thread WebCodecs pixel pump (`VideoSample.copyTo(RGBA)>canvas`, `canvasPoolSize:4`) holds the main thread for ~20 s, whereas ffmpeg.wasm does its heavy lifting off the critical path and only blocks 330 ms. If this row were judged on performance, mediabunny would win decisively; it loses only because correctness ranks first.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on correctness strength: ssim-psnr SSIM mean 0.9923 / min 0.9857 / PSNR 41.4 dB is below ffmpeg's 0.9997 / 0.9996 / 55.7 dB (lossier hardware WebCodecs encode at the chosen bitrate). Geometry is correct (`fit:'contain'`); it simply produces a slightly less faithful re-encode. It would win on every performance axis (28.3x faster) except longtasks.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'pad'." Honest NA — the raw WebCodecs/platform shim has no pad/letterbox filter primitive.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'pad'." Honest NA — its WebCodecs transform set does not include letterbox padding.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest NA — it is a media parser/demuxer, not an encoder.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest NA — MP4Box is a box-level (de)muxer with no pixel/encode pipeline.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest NA — demux-only; cannot re-encode.

## Anti-cheat validation

- Scenario: `src/scenarios/transcode/index.ts:745-748` (case `h264_pad_letterbox_4x3_to_16x9`, feature `pad`, `extraOpts.pad={width:1920,height:1080,color:'black'}`); mapped to a real transcode op with `input:'h264_1080p_30s.mp4'` and gate `tolerances={ssimMin:0.97,psnrMinDb:36}` at `:787-800`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a genuine H.264/AAC MP4, not synthetic/empty/mock.
- Oracle: `ssimVsReferenceSource` in `src/core/oracles.ts:1842-1926`. It decodes the SOURCE in-browser via `ctx.decodeWithPlatform` (`:1866`), prepares a transform-aware reference (`prepareReferenceImage`, `:1893`), and computes real per-frame `ssim()`/`psnrDb()` over 8 frame pairs (`:1883-1909`). SSIM mean is the gate (`:1920`); PSNR is explicitly advisory because the reference resampler differs (`:1915-1919`). This is a real pixel comparison, not trivially satisfiable.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2329-2340` builds a genuine `scale=...force_original_aspect_ratio=decrease + pad=...` filtergraph and runs a real libx264 wasm encode (feature declared `:1488`). No canned output, no input→output copy, no golden short-circuit.
- Measurements plausible: SSIM 0.9997 (min 0.9996), PSNR 55.7 dB over 8 frames are physically consistent with a near-lossless software-encoded letterbox of real 1080p content; mediabunny's 0.9923/41.4 dB are consistent with hardware-encode quality. Both clear the 0.97 floor.
- Verdict: **REAL** — real fixture + real filtergraph/encode implementation + meaningful per-frame SSIM gate.
- Cached note: BOTH PASS results have `cached==true` ("cached previous PASS result"). The evidence was reused, not freshly re-run this session — staleness risk applies to the exact numbers, though the values are self-consistent and the code paths are unchanged.

## Confidence & caveats

- Confidence: medium. The winner is unambiguous on correctness, but the decision is a judgment call where correctness (ffmpeg) and performance (mediabunny, 28.3x faster) point in opposite directions; under a perf-weighted policy mediabunny would win.
- All bench metrics are n=1 (mad=0, p95==median): single-sample evidence, weaker than a multi-run distribution.
- Both PASS rows are cached — numbers are from a prior run, not this session.
- peakMemory and decodeFps were not sampled (n=0) for either engine, so memory could not be compared.
- The ssim-psnr oracle is a perceptual proxy (no bit-exact/golden-pixel gate for this row), so "correctness" here is faithful-reconstruction quality, not bit-exactness.
