# decode-seek/decode_hevc

family: decode-seek | fixture asset: `hevc_1080p_10s.mp4` (HEVC/hvc1 1080p30 + AAC, 11 MB) | primaryMetric: decodeFps | passCount: 5/7

## Verdict

- Best framework: **platform@chrome-149** (Chrome native WebCodecs `VideoDecoder`).
- Contested: YES — 5 engines PASS; 4 of them (platform, mediabunny, web-demuxer, remotion-webcodecs) are tied at the top correctness tier (12/12 bit-exact frame digests, SSIM=1, PSNR=∞). ffmpeg.wasm also PASSes but at a weaker correctness tier (0/12 exact, SSIM proxy).
- Decisive factor: among the four bit-exact engines correctness is identical, so the **primaryMetric (decodeFps) breaks the tie**. platform leads at 47.98 fps.
- Margin over runner-up (mediabunny, 46.91 fps): **1.02x faster decodeFps / 1.02x lower wall (625.2 ms vs 639.5 ms)**. This is a thin margin on n=1 (see caveats). platform pays for it with the highest peak memory (775.9 MB vs remotion-webcodecs 283.8 MB).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | decodeFps | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | ssim-psnr:pass (12/12 exact) | 625.24 | 47.98 | 775,921,460 | 5077 | cached previous PASS |
| mediabunny@1.48.0 | PASS | ssim-psnr:pass (12/12 exact) | 639.51 | 46.91 | 0 (not sampled) | 19963 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | ssim-psnr:pass (12/12 exact) | 803.23 | 37.35 | 0 (not sampled) | 3675 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | ssim-psnr:pass (12/12 exact) | 962.97 | 31.15 | 283,811,612 | 19963 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass (0/12 exact, SSIM 0.99995) | 1055.54 | 28.42 | 0 (not sampled) | 3391 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

## Why the winner wins (deep technical)

The operation is linear decode of HEVC (`hvc1`) carried in an MP4, with 30 frames requested (`maxFrames: 30`, scenario `src/scenarios/decode-seek/index.ts:85-93`). HEVC differs from H.264 here in two load-bearing ways: (1) its decoder configuration record (`hvcC`) lives **out-of-band** in the sample-description box rather than in-band, so a decoder must demux and forward that extradata as `VideoDecoderConfig.description`; and (2) Chrome's HEVC decode path is hardware-only on this M1 Max (`ANGLE Metal Renderer`), so an engine that can route to the GPU VideoToolbox-backed decoder gets a large speed advantage over a CPU/wasm HEVC decoder.

platform takes exactly that GPU path. `env.configUsed` reports `backend:"webcodecs", hwAccel:true, decode:"VideoDecoder", pipeline:"streaming", queueDepth:2, frameTransfer:"transferable"`. The adapter's decode driver (`src/engines/platform/decode.ts:89` `decodeWithWebCodecs`) builds the config, and at `src/engines/platform/decode.ts:112` it correctly keeps the out-of-band description for description-bearing codecs (`codecUsesDescription`, `decode.ts:77-83`, which returns true for hvc1/hev1 and false only for VP8/VP9) — i.e. it forwards the demuxed `hvcC` so the native decoder can configure. It gates on the real `VideoDecoder.isConfigSupported` (`decode.ts:119-122`) before configuring, then feeds `EncodedVideoChunk`s in decode order and flushes (`decode.ts:195-205`), reorders the collected `VideoFrame`s into presentation order by pts (`decode.ts:222`), rasterizes each frame to ImageData (`raster.ts`) and SHA-256 digests it (`digest.ts`). Because the committed golden (`fixtures/golden/hevc_1080p_10s.mp4.frames.json`, `pending:false`) was baked by this exact `platform/digest.ts` normalized-RGBA pipeline, platform's per-frame digests match bit-for-bit: the oracle records `pairs:12, exactFrames:12, ssimMean:1, ssimMin:1` → "all 12 paired frames digest-identical (SSIM=1, PSNR=∞)".

The ssim-psnr oracle (`src/core/oracles.ts:1688`) is satisfied by the strongest path it offers: digest equality (`oracles.ts:1766`) short-circuits each pair to SSIM 1 / PSNR ∞, and when `exactCount === pairs` it returns the digest-identical PASS (`oracles.ts:1803-1809`). So this is not the loose SSIM-floor branch — it is exact-frame equality, the bit-exact tier of the correctness ladder.

mediabunny is the closest rival and also reaches 12/12 exact (`env.configUsed.backend:"webcodecs", hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`) — it routes to the same hardware HEVC decoder via its own canDecodeVideo probe (`src/engines/mediabunny/adapter.ts:891-903`) and `decodeFrames` sink (`adapter.ts:1330`). Correctness is therefore a dead heat with platform; the decision falls to decodeFps, where platform's 47.98 narrowly beats mediabunny's 46.91 (1.02x), with a correspondingly lower wall (625.2 vs 639.5 ms). A secondary point in platform's favor is responsiveness: its longtasks total is 5077 ms versus mediabunny's 19963 ms, i.e. platform blocked the main thread far less — though platform's peak memory (775.9 MB) is the highest of the field, so this is a speed/responsiveness win paid for in RAM.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, bit-exact (12/12). Lost only on the primary metric: decodeFps 46.91 vs platform 47.98 (0.978x), wall 639.5 ms vs 625.2 ms. Also far worse main-thread blocking (longtasks 19963 ms vs 5077 ms). A very close, legitimate runner-up.
- **web-demuxer@4.0.0** — PASS, bit-exact (12/12), and lowest longtasks (3675 ms). Lost on throughput: decodeFps 37.35 (0.78x of platform), wall 803.2 ms (1.28x slower). Its demux-then-WebCodecs path carries more per-frame overhead.
- **remotion-webcodecs@4.0.479** — PASS, bit-exact (12/12). Slowest of the WebCodecs group: decodeFps 31.15 (0.65x), wall 962.97 ms (1.54x slower), longtasks 19963 ms. Its `streaming-backpressure` writer/queue machinery (`waitForQueueToBeLessThan`) adds latency for a simple linear decode.
- **ffmpeg.wasm@0.12.15** — PASS but at the WEAKEST correctness tier: `exactFrames:0`, gated only by the SSIM proxy (`ssimMin 0.99995 ≥ 0.99`). Its software HEVC decoder produces RGBA that is perceptually identical but not bit-identical to the platform-baked golden, so 0/12 digests match. Also slowest overall: decodeFps 28.42 (0.59x), wall 1055.5 ms (1.69x slower). It would lose on correctness strength alone, before performance.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". HONEST — mp4box is a pure-JS MP4 demuxer with no video decoder (`src/engines/mp4box/adapter.ts:7-12`); it cannot decode HEVC pixels.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decodeFrames'". HONEST — it is a parser that emits encoded samples only; `decodeFrames` explicitly throws "no decoder; emits encoded samples only" (`src/engines/remotion-media-parser/adapter.ts:556-557`).

## Anti-cheat validation

- Scenario: `src/scenarios/decode-seek/index.ts:85-93` — `id:'decode_hevc', asset:'hevc_1080p_10s.mp4', container:'mp4', videoCodec:'hevc', maxFrames:30`, notes: "HEVC (hvc1) in MP4. NA(browser) where the browser cannot configure an HEVC decoder."
- Fixture: `fixtures/media/hevc_1080p_10s.mp4` EXISTS, 11 MB real media; golden meta (`fixtures/golden/hevc_1080p_10s.mp4.meta.json`) describes HEVC 1920x1080@30, bitrate 8.71 Mbps + AAC 48 kHz stereo — physically plausible for a 10 s 1080p HEVC clip. Golden frame digests (`hevc_1080p_10s.mp4.frames.json`, `pending:false`) and a 75 KB `ssim.json` are committed. Not synthetic/mock.
- Oracle: `src/core/oracles.ts:1688` `ssimPsnr` — performs a real per-frame comparison: digest equality first (`:1766`), falling back to downsampled-luma SSIM against `ssim.json` sigs (`:1782-1786`); digest-identical → SSIM 1 / PSNR ∞ PASS (`:1803-1809`). Not trivially satisfiable: the winner cleared it via 12/12 exact digest match, and ffmpeg.wasm demonstrably FAILED the exact tier (0/12) and only scraped through on the proxy — proof the gate discriminates.
- Winner adapter: `src/engines/platform/decode.ts:89-163` (`decodeWithWebCodecs`) genuinely configures a native `VideoDecoder`, gates on real `isConfigSupported` (`:119`), feeds real `EncodedVideoChunk`s, reorders by pts, and digests rasterized pixels. No canned output, no input copy, no short-circuit to golden, no error-swallow-as-success.
- Cached note: platform's result is `cached:true` ("cached previous PASS result", started 2026-06-22T14:06). All five PASS rows are cached reruns rather than fresh executions. Per launcher seeding caveat, cached PASS reuse carries mild staleness risk, but the digests/measurements are consistent with the committed golden.
- Verdict: **REAL** — real fixture + real WebCodecs implementation + a meaningful exact-digest gate that other engines failed.

## Confidence & caveats

- Confidence: medium. The REAL validation and bit-exact correctness are solid, but the performance margin that decides the contest is thin (1.02x decodeFps over mediabunny) and every bench is **n=1** with `mad:0` — a single sample with no spread, so the platform-vs-mediabunny ordering could plausibly flip on a re-run.
- All five PASS results are `cached:true`; none was freshly re-run for this report.
- The golden frames were baked by the platform engine's own digest pipeline, which structurally favors WebCodecs-pixel engines on the exact-digest tier and pushes ffmpeg.wasm onto the SSIM proxy. This is a known, documented property of the golden (see the `$todo` note in frames.json), not a cheat, but it means "bit-exact" here means "matches platform's normalized RGBA," not "matches a decoder-independent reference."
- platform's peakMemory (775.9 MB) is the highest in the field; if peak memory were weighted above throughput, remotion-webcodecs (283.8 MB) would look better — but it is 1.54x slower and correctness is equal, so it does not unseat platform under the stated decision procedure.
